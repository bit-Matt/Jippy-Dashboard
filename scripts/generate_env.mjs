/*
 * Jippy, A Public Utility Vehicle navigation platform
 * Copyright (c) 2026 Jippy Developers
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { generateToken } from "./common.mjs";

// Constants
const __dirname = import.meta.dirname;

// Flags
const ENABLE_REDIS = process.argv.includes("--enable-redis");
const COMPOSE_SERVICES_ENABLED = ["db"];

console.log("[env]     Generating config...");

// Populate the values
const templatePath = path.join(__dirname, "./templates/env_template.txt");
let template = fs.readFileSync(templatePath, "utf-8");

// Better Auth token setup
const betterAuthToken = generateToken(32);
template = template.replace("BETTER_AUTH_TOKEN=YOUR_TOKEN_GOES_HERE", `BETTER_AUTH_TOKEN="${betterAuthToken}"`);

// PostgreSQL setup
const dbPassword = generateToken(16);
template = template.replace("POSTGRES_PASSWORD=mypassword", `POSTGRES_PASSWORD="${dbPassword}"`);

if (ENABLE_REDIS) {
  template = template.replace("# REDIS_URL=REDIS_URL_GOES_HERE", 'REDIS_URL="redis://localhost:6379"');
  template = template.replace("# REDIS_CACHE_LIFETIME=30", "REDIS_CACHE_LIFETIME=30");

  COMPOSE_SERVICES_ENABLED.push("cache");
}

// Write
const dotEnvPath = path.join(__dirname, "../.env");
fs.writeFileSync(dotEnvPath, template, "utf-8");

console.log("[env]     Config generated.");
console.log("[compose] Creating containers via docker-compose.yml file...");

spawnSync("docker", ["compose", "up", "-d", ...COMPOSE_SERVICES_ENABLED], {
  cwd: path.join(__dirname, "../"),
  stdio: "inherit",
});

console.log("[compose] Containers successfully created.");
