import { createClient } from "redis";
import { DateTime } from "luxon";
import * as Sentry from "@sentry/nextjs";

import { utils } from "@/lib/validator";

// Prevent TypeScript errors for global augmentation
const globalForRedis = global as unknown as {
  cacheManager: CacheManager | undefined;
};

class CacheManager {
  private readonly _url: string | null = null;
  private readonly _disabled: boolean = false;

  private _client?: ReturnType<typeof createClient>;

  constructor() {
    if (utils.isExisty(process.env.REDIS_URL) && utils.isNonEmpty(process.env.REDIS_URL)) {
      this._url = process.env.REDIS_URL!;
      this._disabled = false;

      return;
    }

    this._url = null;
    this._disabled = true;

    Sentry.logger.warn("Redis is disabled. REDIS_URL is not set.");
  }

  /**
   * Returns a connected and healthy Redis client, creating/reconnecting if needed.
   *
   * Reuses an existing client when it is both `isOpen` and `isReady`. Otherwise, it
   * instantiates a new client, wires an `"error"` handler that reports to Sentry,
   * and connects before returning.
   *
   * @returns {Promise<ReturnType<typeof createClient>>} A ready-to-use Redis client.
   */
  private async getClient(): Promise<ReturnType<typeof createClient>> {
    if (this._disabled) throw new Error("Redis is disabled.");

    // If a client exists and is healthy, return it
    if (this._client?.isOpen && this._client?.isReady) {
      return this._client;
    }

    // Otherwise, create/reconnect
    this._client = await createClient({ url: this._url! })
      .on("error", (e) => Sentry.captureException(e))
      .connect();

    return this._client;
  }

  /**
   * Reads all fields from a Redis hash and parses each stored JSON value.
   *
   * @template T The element type expected after JSON parsing.
   * @param {string} key Redis hash key.
   * @returns {Promise<T[]>} Array of parsed values from the hash (order is not guaranteed).
   *
   * @remarks
   * Assumes each hash field value is a JSON-encoded string.
   */
  async hgetAll<T>(key: string): Promise<T[]> {
    if (this._disabled) return [];

    const client = await this.getClient();

    const object = await client.hGetAll(key);
    return Object.values(object).map((i) => {
      try {
        return JSON.parse(i);
      } catch {
        return null;
      }
    }).filter(x => x !== null) as T[];
  }

  /**
   * Writes multiple fields to a Redis hash and optionally sets an expiration.
   *
   * If `options.lifetime` is provided (in minutes) and greater than 0, an expiry is set
   * using the `"NX"` mode (only if the key does not already have an expiration).
   *
   * @param {string} key Redis hash key.
   * @param {Record<string, string>} value Field/value pairs to write.
   * @param {CacheOptions} [options] Optional caching behavior (e.g., lifetime in minutes).
   * @returns {Promise<void>} Resolves when the write (and optional expiry) completes.
   */
  async hset(key: string, value: Record<string, string>, options?: CacheOptions): Promise<void> {
    if (this._disabled) return;

    const client = await this.getClient();
    await client.hSet(key, value);

    // Set lifetime
    if (options?.lifetime && options.lifetime > 0) {
      await client.expire(key, options.lifetime * 60, "NX");
    }
  }

  /**
   * Updates a single field in an existing Redis hash.
   *
   * No-op if the hash key does not exist. This avoids implicitly creating new keys
   * during write attempts.
   *
   * @param {string} key Redis hash key.
   * @param {string} innerKey Hash field to update.
   * @param {string} newValue New field value to set.
   * @returns {Promise<void>} Resolves when the update completes (or immediately if the key is missing).
   */
  async hsetWrite(key: string, innerKey: string, newValue: string): Promise<void> {
    if (this._disabled) return;

    const client = await this.getClient();

    const isKeyExists = await client.exists(key);
    if (!isKeyExists) {
      return;
    }

    await client.hSet(key, innerKey, newValue);
  }

  /**
   * Writes a JSON document at the root (`"$"`) using RedisJSON and optionally sets an expiration.
   *
   * If the key already exists and `options.overwrite` is not truthy, this method is a no-op.
   * When the JSON write succeeds (`"OK"`) and a positive lifetime (minutes) is provided, the
   * key expiration is set via `EXPIREAT` using `"NX"` (only if no expiration is already set).
   *
   * @param {string} key Redis key for the JSON document.
   * @param {ValueType} value JSON value to store.
   * @param {CacheOptions} [options] Optional behavior (overwrite, lifetime in minutes).
   * @returns {Promise<void>} Resolves when the write (and optional expiry) completes.
   */
  async writeJson(key: string, value: ValueType, options?: CacheOptions): Promise<void> {
    if (this._disabled) return;

    const client = await this.getClient();

    const isKeyExists = await client.exists(key);
    if (isKeyExists && !options?.overwrite) {
      return;
    }

    const result = await client.json.set(key, "$", value);

    if (result === "OK" && options?.lifetime && options.lifetime > 0) {
      const time = DateTime.utc().plus({ minutes: options.lifetime }).toJSDate();
      client.expireAt(key, time, "NX");
    }
  }

  /**
   * Atomically updates a JSON sub-path for an existing RedisJSON document.
   *
   * No-op if the key does not exist.
   *
   * @param {string} key Redis key for the JSON document.
   * @param {string} path RedisJSON path to update (e.g., `"$.foo.bar"`).
   * @param {ValueType} value Value to set at the given path.
   * @returns {Promise<void>} Resolves when the update completes (or immediately if the key is missing).
   */
  async writeJsonAtomic(key: string, path: string, value: ValueType): Promise<void> {
    if (this._disabled) return;

    const client = await this.getClient();

    const isKeyExists = await client.exists(key);
    if (!isKeyExists) return;

    await client.json.set(key, path, value);
  }

  /**
   * Reads a JSON document from RedisJSON at the root path (`"$"`).
   *
   * RedisJSON may return the root query as a single-element array; this helper
   * unwraps that shape and returns the underlying value.
   *
   * @template T The expected JSON type.
   * @param {string} key Redis key for the JSON document.
   * @returns {Promise<T | null>} The parsed JSON value, or `null` if not found.
   */
  async getJson<T>(key: string): Promise<T | null> {
    if (this._disabled) return null;

    const client = await this.getClient();
    const json = await client.json.get(key, { path: "$" });

    if (!json) return null;
    if (Array.isArray(json) && json.length === 1) {
      return json[0] as T;
    }
    return json as T;
  }

  /**
   * Reads a JSON value from RedisJSON at a specific path.
   *
   * Returns `null` when the key/path does not exist. If RedisJSON returns an empty
   * array for the query result, this method treats it as "not found".
   *
   * @template T The expected JSON type.
   * @param {string} key Redis key for the JSON document.
   * @param {string} path RedisJSON path to read (e.g., `"$.items[0]"`).
   * @returns {Promise<T | null>} The value at the path, or `null` if not found.
   */
  async getJsonAtomic<T>(key: string, path: string): Promise<T | null> {
    if (this._disabled) return null;

    const client = await this.getClient();
    const json = await client.json.get(key, { path });

    if (!json) return null;
    if (Array.isArray(json) && json.length === 0) return null;
    return json as T;
  }

  /**
   * Deletes a key if it exists.
   *
   * @param {string} key Redis key to delete.
   * @returns {Promise<void>} Resolves when deletion completes (or immediately if missing).
   */
  async delete(key: string): Promise<void> {
    if (this._disabled) return;

    const client = await this.getClient();
    const exists = await client.exists(key);
    if (exists) {
      await client.del(key);
    }
  }

  /**
   * Deletes a JSON sub-path from an existing RedisJSON document (if the key exists).
   *
   * @param {string} key Redis key for the JSON document.
   * @param {string} path RedisJSON path to delete.
   * @returns {Promise<void>} Resolves when deletion completes (or immediately if missing).
   */
  async deleteAtomic(key: string, path: string): Promise<void> {
    if (this._disabled) return;

    const client = await this.getClient();
    const exists = await client.exists(key);
    if (exists) {
      await client.json.del(key, { path });
    }
  }
}

export type CacheOptions = Partial<{
  /**
   * Enable overwriting of existing key.
   */
  overwrite: boolean;

  /**
   * Non-zero positive integer representing the number of MINUTES until the cache entry expires.
   */
  lifetime: number;
}>

export const cacheManager = globalForRedis.cacheManager ?? new CacheManager();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.cacheManager = cacheManager;
}

type RedisClient = ReturnType<typeof createClient>;
export type ValueType = Parameters<RedisClient["json"]["set"]>[2];
