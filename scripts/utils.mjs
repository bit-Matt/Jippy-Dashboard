import fs from "node:fs";
import fsp from "node:fs/promises";
import child_process from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import * as pg from "pg";
import * as readline from "node:readline/promises";
import {stdin, stdout} from "node:process";

const __dirname = import.meta.dirname;

/**
 * Uppercase characters
 * @type {string}
 */
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Lowercase characters
 * @type {string}
 */
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";

/**
 * Numbers
 * @type {string}
 */
const NUMBERS = "0123456789";

/**
 * Special characters
 * @see https://owasp.org/www-community/password-special-characters
 * @type {string}
 */
const SPECIAL_CHARACTERS = "-._~";

export const prompt = {
  /**
   * Ask a question asynchronously.
   *
   * @param q {string} - The question to ask.
   * @returns {Promise<string>} - The answer to the question.
   */
  async questionAsync(q) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const response = await rl.question(q);

    rl.close();
    return response;
  },
};

export const token = {
  /**
   * Generates a random password with the specified length.
   * @param length {number} - Length of the password.
   * @param additionalSymbols {string} - Additional symbols to include in the password.
   * @returns {string}
   */
  generatePassword: (length = 32, additionalSymbols = "") => {
    let result = "";
    while (!checkPasswordComplexity(result)) {
      // Reset the contents
      result = "";

      // Randomize proportions for the password
      const [ lowerLength, upperLength, numberCount, symbolCount ] = randomPartition(length);

      // Lowercase characters
      for (let i = 0; i < lowerLength; i++) {
        result += LOWERCASE[crypto.randomInt(0, LOWERCASE.length)];
      }

      // Uppercase characters
      for (let i = 0; i < upperLength; i++) {
        result += UPPERCASE[crypto.randomInt(0, UPPERCASE.length)];
      }

      // Numbers
      for (let i = 0; i < numberCount; i++) {
        result += NUMBERS[crypto.randomInt(0, NUMBERS.length)];
      }

      // Symbols
      const SYMBOLS = SPECIAL_CHARACTERS + additionalSymbols;
      for (let i = 0; i < symbolCount; i++) {
        result += SYMBOLS[crypto.randomInt(0, SYMBOLS.length)];
      }

      // Shuffle the result
      result = shuffle(result);
    }

    return result;
  },
};

export const process = {
  /**
   * Spawns a child process asynchronously.
   *
   * @param command {string} - The command to execute.
   * @param args {string[]} - The arguments to pass to the command.
   * @param options {child_process.SpawnOptions} - Additional options to pass to the child process.
   * @returns {Promise<unknown>}
   */
  spawnAsync: async (command, args, options = {}) => {
    return new Promise((resolve, reject) => {
      const child = child_process.spawn(command, args, {
        stdio: "inherit",
        ...options, // Allow overriding defaults
      });

      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  },
};

export const fsUtils = {
  createRecursiveDirectories(root, subPaths) {
    const paths = subPaths.map(subPath => path.join(root, subPath));
    for (const path of paths) {
      // No need for existing directories.
      if (fs.existsSync(path)) {
        continue;
      }

      // Create directory.
      fs.mkdirSync(path, { recursive: true });
    }
  },
  removeDir(loc) {
    fs.rmSync(loc, { recursive: true });
  },
  async unpackWith7z(args) {
    const platform = os.platform();
    const arch = platform === "darwin" ? "any" : `${os.arch()}`;
    const exe = platform === "win32" ? "7z.exe" : "7zz";

    const exePath = path.join(__dirname, "7z", `${platform}-${arch}`, exe);
    if (!fs.existsSync(exePath)) {
      console.error("No such platform prefix exists for unpacking: %s", `${platform}-${arch}/${exe}`);
      process.exit(1);
    }

    if (platform !== "win32") {
      fs.chmodSync(exePath, 0o755);
    }

    await process.spawnAsync(exePath, args);
  },
};

export const db = {
  /**
   * Builds a PostgreSQL connection string (URI) from discrete connection fields.
   *
   * Creates a `postgres://` URL using the provided credentials and database name,
   * applying defaults for host and port when omitted.
   *
   * @param {Object} params - Connection parameters.
   * @param {string} params.username - Database username.
   * @param {string} params.password - Database password.
   * @param {string} params.name - Database name (used as the URL pathname).
   * @param {string} [params.host] - Database host (defaults to `"localhost"`).
   * @param {string|number} [params.port] - Database port (defaults to `"5173"`).
   * @param {Record<string, string>} [params.query] - Additional query parameters to append to the URL.
   *
   * @returns {string} A PostgreSQL connection string like:
   * `postgres://username:password@host:port/databaseName`
   *
   * @example
   * const connectionString = db.createConnectionString({
   *   username: "my_user",
   *   password: "my_password",
   *   host: "127.0.0.1",
   *   port: 5432,
   *   name: "my_db",
   *   query: {
   *     schema: "public", // Optional query parameter
   *   }
   * });
   * // => "postgres://my_user:my_password@127.0.0.1:5432/my_db?schema=public"
   *
   * @notes
   * - The database name is assigned to `url.pathname`; if it contains special characters,
   *   they will be URL-encoded by `URL#toString()`.
   * - If `username`/`password` are empty strings or `undefined`, the resulting URI may omit
   *   or partially omit credentials depending on `URL` behavior.
   */
  createConnectionString({ username, password, name, host, port, query }) {
    const url = new URL(`postgres://${host ?? "localhost"}:${port ?? "5173"}`);
    url.pathname = name;
    url.username = username;
    url.password = password;

    if (query) {
      for (const key of Object.keys(query)) {
        url.searchParams.append(key, query[key]);
      }
    }

    return url.toString();
  },

  /**
   * Ensures that a PostgreSQL database exists, creating it if necessary.
   *
   * This function connects to the specified PostgreSQL instance
   * (via the `postgres` maintenance database), checks whether the target
   * database exists, and creates it if it does not.
   *
   * The database name is safely quoted as a PostgreSQL identifier
   * to prevent SQL injection, and an error is thrown if the name
   * is invalid or empty.
   *
   * @async
   * @param {Object} params - Database connection parameters.
   * @param {string} params.username - Database username.
   * @param {string} params.password - Database password.
   * @param {string} params.name - Name of the database to ensure exists.
   * @param {string} params.host - Host of the PostgreSQL server.
   * @param {number|string} params.port - Port of the PostgreSQL server.
   *
   * @returns {Promise<void>} Resolves when the database existence is ensured.
   *
   * @throws {Error} Throws an error if connecting to PostgreSQL fails,
   *                 or if creating the database encounters errors.
   */
  async setupDatabase({ username, password, name, host, port }) {
    const client = new pg.Client({
      connectionString: this.createConnectionString({
        username,
        password,
        host,
        port,
        name: "postgres", // connect to maintenance DB
      }),
    });

    await client.connect();
    try {
      const { rowCount } = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [name],
      );

      if (rowCount === 0) {
        const dbIdent = quoteIdent(name);
        await client.query(`CREATE DATABASE ${dbIdent}`);
      }
    } finally {
      await client.end();
    }
  },

  /**
   * Enables the PostGIS extension in a PostgreSQL database if it's not already enabled.
   *
   * This function connects to the specified PostgreSQL database and checks if the PostGIS extension
   * is installed. If not, it creates and enables the extension in the target database.
   *
   * @async
   * @param {Object} params - Database connection parameters.
   * @param {string} params.username - Database username.
   * @param {string} params.password - Database password.
   * @param {string} params.name - Name of the target database.
   * @param {string} params.host - Host of the PostgreSQL server.
   * @param {number|string} params.port - Port of the PostgreSQL server.
   *
   * @returns {Promise<void>} Resolves once the extension is enabled or if it's already present.
   *
   * @throws {Error} Throws an error if the connection or the extension creation process fails.
   */
  async enablePostgisExtension ({ username, password, name, host, port }) {
    const client = new pg.Client({
      connectionString: this.createConnectionString({
        username,
        password,
        host,
        port,
        name,
        query: {
          schema: "public",
        },
      }),
    });
    await client.connect();

    const query = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
    if (query.rowCount === 0) {
      await client.query("CREATE EXTENSION postgis");
    }

    await client.end();
  },

  preDockerConfigure: async () => {
    const root = path.join(__dirname, "../.osm-data");
    const subPaths = [
      "nominatim",
      "tileserver",
      "tileserver/coastline",
      "tileserver/landcover/ne_10m_urban_areas",
      "valhalla",
    ];
    fsUtils.createRecursiveDirectories(root, subPaths);

    const ne10m = path.join(root, "ne_10m_urban_areas.zip");
    const ne10mExtractPath = path.join(root, "tileserver/landcover/ne_10m_urban_areas");
    if (!fs.existsSync(ne10m)) {
      const url = "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_urban_areas.zip";

      // Download
      console.log("Downloading ne_10m_urban_areas.zip");
      await process.spawnAsync("curl", [
        "-L",
        "-o", ne10m,
        url,
      ]);
    }

    // Remove extraction folder
    if (fs.existsSync(ne10mExtractPath)) {
      fsUtils.removeDir(ne10mExtractPath);
      fs.mkdirSync(ne10mExtractPath, { recursive: true });
    }

    // Extract
    await fsUtils.unpackWith7z([
      "x",
      ne10m,
      `-o${ne10mExtractPath}`,
    ]);

    const coastline = path.join(root, "water-polygons-split-4326.zip");
    const coastlineExtractPath = path.join(root, "tileserver/coastline");
    if (!fs.existsSync(coastline)) {
      const url = "https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip";

      // Download
      console.log("Downloading water-polygons-split-4326.zip");
      await process.spawnAsync("curl", [
        "-L",
        "-o", coastline,
        url,
      ]);
    }

    // Remove extraction folder
    if (fs.existsSync(coastlineExtractPath)) {
      fsUtils.removeDir(coastlineExtractPath);
      fs.mkdirSync(coastlineExtractPath, { recursive: true });
    }

    // Extract
    console.log("Extracting water-polygons-split-4326.zip to tileserver/coastline...");
    await fsUtils.unpackWith7z([
      "e",
      coastline,
      `-o${coastlineExtractPath}`,
      "-y",
    ]);

    const pbfPath = path.join(root, "philippines-latest.osm.pbf");
    if (!fs.existsSync(pbfPath)) {
      const url = "https://download.geofabrik.de/asia/philippines-latest.osm.pbf";

      console.log("Downloading PBF Data from: %s", url);
      await process.spawnAsync("curl", [
        "-L",
        "-o", pbfPath,
        url,
      ]);
    } else {
      console.log("philippines-latest.osm.pbf is already downloaded. Skipping...");
    }

    const configJsonPath = path.join(root, "./tileserver/config-openmaptiles.json");
    if (!fs.existsSync(configJsonPath)) {
      const url = "https://raw.githubusercontent.com/systemed/tilemaker/refs/heads/master/resources/config-openmaptiles.json";

      console.log("Downloading config-openmaptiles.json...: %s", url);
      await process.spawnAsync("curl", [
        "-L",
        "-o", configJsonPath,
        url,
      ]);
    } else {
      console.log("config-openmaptiles.json is already downloaded. Skipping...");
    }

    const luaScriptPath = path.join(root, "./tileserver/process-openmaptiles.lua");
    if (!fs.existsSync(luaScriptPath)) {
      const url = "https://raw.githubusercontent.com/systemed/tilemaker/refs/heads/master/resources/process-openmaptiles.lua";

      console.log("Downloading process-openmaptiles.lua...: %s", url);
      await process.spawnAsync("curl", [
        "-L",
        "-o", luaScriptPath,
        url,
      ]);
    } else {
      console.log("process-openmaptiles.lua is already downloaded. Skipping...");
    }
  },
};

export const timers = {
  /**
   * Wait for a specified number of seconds.
   *
   * @param secs {number} - Number of seconds to wait.
   * @returns {Promise<unknown>}
   */
  wait: (secs) => {
    return new Promise((resolve) => setTimeout(resolve, secs * 1000));
  },
};

export const csv = {
  read: async (location) => {
    const file = await fsp.readFile(location, "utf-8");
    const [header, ...data] = file.split(/\r?\n/).map((row) => row.split(","));

    const output = [];
    for (const item of data) {
      const result = {};
      for (let i = 0; i < header.length; i++) {
        result[header[i]] = item[i];
      }

      output.push(result);
    }

    return output;
  },
};

/**
 * Docker configuration
 *
 * @type {Map<string, string>}
 */
const DOCKER_CONFIG = new Map();

/**
 * Runtime configuration
 *
 * @type {Map<any, any>}
 */
const RUNTIME_CONFIG = new Map();

export const env = {
  /**
   * Ask a question and write the config for you.
   *
   * @param {string} question - The question to ask.
   * @param {string} key - The key to write the value to.
   * @param {string} [defaultValue] - Default value if nothing is entered.
   * @returns {Promise<string>} - The answer to the question.
   */
  async ask(question, key, defaultValue){
    const q = await prompt.questionAsync(`${question}${defaultValue ? ` (default: ${defaultValue})` : ""}: `);

    // Default value
    if (!q && defaultValue) {
      this.write(key, defaultValue);

      return defaultValue;
    }

    this.write(key, q);
    return q;
  },

  /**
   * Writes a configuration value to the appropriate configuration context (e.g., docker or runtime).
   *
   * The provided key is expected to be in the format "context.key", where the "context" determines
   * the configuration scope (e.g., "docker") and "key" specifies the configuration key within that scope.
   *
   * @param {string} key - A dot-delimited string specifying the configuration context and the key.
   * @param {string} value - The value to be stored for the specified configuration key.
   */
  write: (key, value) => {
    const [context, ...rest] = key.split(".");

    if (context === "docker") {
      const configKey = rest.join("_").toUpperCase();
      DOCKER_CONFIG.set(configKey, value);

      return;
    }

    const runtimeKey = rest.join("_").toUpperCase();
    RUNTIME_CONFIG.set(runtimeKey, value);
  },

  /**
   * Exports the configuration to the specified path.
   *
   * @param path {string} - The path to which the configuration should be exported.
   * @returns {Promise<void>}
   */
  export: async (path) => {
    let config = "# DO NOT commit this file to your repository!\n";

    RUNTIME_CONFIG.forEach((value, key) => {
      config += `${key}="${value}"\n`;
    });

    config += "\n";

    DOCKER_CONFIG.forEach((value, key) => {
      config += `${key}="${value}"\n`;
    });

    await fs.promises.writeFile(path, config, "utf-8");
  },
};

export const str = {
  isEmpty(str) {
    if (str === null || str === undefined) return true;
    if (typeof str !== "string") return true;
    if (str.trim().length === 0) return true;
    return str.replace(/\s/g, "").length === 0;
  },
};

function checkPasswordComplexity(password) {
  // Zero-length or undefined inputs
  if (!password || password.trim().length === 0 || password.length < 8) {
    return false;
  }

  return (password.match(/[a-z]/g) ?? []).length >= 2 // At least there are 2 lowercase characters
        && (password.match(/[A-Z]/g) ?? []).length >= 2 // At least there are 2 uppercase characters
        && (password.match(/[0-9]/g) ?? []).length >= 2 // At least there should be 2 numbers
        && (password.match(/[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g) ?? []).length >= 2; // 2 Symbols.
}

/**
 * Function that generates random lengths for the password
 * @returns {number[]}
 */
function randomPartition(total = 32) {
  // Adjust the total by subtracting the minimum requirement
  const parts = 4;
  const minVal = 2;

  const adjustedTotal = total - parts * minVal;

  // Pick random "cut points" for partitioning adjustedTotal
  let cuts = [];
  for (let i = 0; i < parts - 1; i++) {
    cuts.push(crypto.randomInt(0, adjustedTotal + 1));
  }
  cuts.sort((a, b) => a - b);

  // Build the partition
  let result = [];
  let prev = 0;
  for (let i = 0; i < parts - 1; i++) {
    result.push(cuts[i] - prev + minVal);
    prev = cuts[i];
  }
  result.push(adjustedTotal - prev + minVal);

  return result;
}

/**
 * Shuffles the string
 * @param str
 * @returns {*}
 */
function shuffle(str) {
  // Convert a string into an array (so we can swap characters)
  const arr = str.split("");

  // Fisher–Yates shuffle with crypto.randomInt
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1); // 0 ≤ j ≤ i
    [arr[i], arr[j]] = [arr[j], arr[i]]; // swap
  }

  return arr.join("");
}

function quoteIdent(ident) {
  // PostgreSQL identifier quoting: double-quote and escape internal double-quotes by doubling them.
  // Also, reject empty names early.
  if (typeof ident !== "string" || ident.length === 0) {
    throw new Error("Database name must be a non-empty string");
  }
  return `"${ident.replace(/"/g, "\"\"")}"`;
}
