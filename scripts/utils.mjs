import fs from "node:fs";
import child_process from "node:child_process";
import crypto from "node:crypto";
import * as readline from "node:readline/promises";
import path from "node:path";
import * as pg from "pg";
import {stdin, stdout} from "node:process";

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

export const db = {
  /**
   * Configure the database.
   *
   * @param dbUsername {string} - The username to use for the database.
   * @param dbPassword {string} - The password to use for the database.
   * @param dbName {string} - The name of the database to create.
   * @param dbHost {string} - The hostname of the database. (Default: localhost)
   * @param dbPort {string} - The port of the database. (Default: 5173)
   * @returns {Promise<void>}
   */
  setupDatabase: async (dbUsername, dbPassword, dbName, dbHost = "localhost", dbPort = "5173") => {
    const client = new pg.Client({
      connectionString: `postgres://${dbUsername}:${dbPassword}@${dbHost}:${dbPort}/postgres`,
    });
    await client.connect();

    const query = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (query.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, "\"\"")}"`);
    }

    await client.end();
  },

  enablePostgisExtension: async (dbUsername, dbPassword, dbName, dbHost = "localhost", dbPort = "5173") => {
    const client = new pg.Client({
      connectionString: `postgres://${dbUsername}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`,
    });
    await client.connect();

    const query = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
    if (query.rowCount === 0) {
      await client.query("CREATE EXTENSION postgis");
    }

    await client.end();
  },

  preNominatimConfigure: async () => {
    const pbfPath = path.join(__dirname, "../.osm-data/philippines-latest.osm.pbf");
    if (fs.existsSync(pbfPath)) return;

    const pbfFolder = path.join(__dirname, "../.osm-data");
    if (!fs.existsSync(pbfFolder)) fs.mkdirSync(pbfFolder);

    console.log("Downloading PBF Data from: https://download.geofabrik.de/asia/philippines-latest.osm.pbf");
    await process.spawnAsync("curl", [
      "-L",
      "-o",
      pbfPath,
      "https://download.geofabrik.de/asia/philippines-latest.osm.pbf",
    ]);
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
