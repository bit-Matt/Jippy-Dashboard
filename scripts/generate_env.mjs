import fs from "node:fs";
import path from "node:path";
import readlineSync from "readline-sync";
import { spawnSync } from "node:child_process";

import { generateDb, generateToken } from "./common.mjs";

// Constants
const __dirname = import.meta.dirname;

// Flags
const SKIP_CONTAINER_BUILD = process.argv.includes("--skip-container-build");
const COMPOSE_SERVICES_ENABLED = ["db", "cache"];

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

// Replace it in URL
template = template.replace("${POSTGRES_USER}", "postgres");
template = template.replace("${POSTGRES_PASSWORD}", dbPassword);
template = template.replace("${POSTGRES_DB}", "jippy");

// Redis
template = template.replace("# REDIS_URL=REDIS_URL_GOES_HERE", 'REDIS_URL="redis://localhost:6379"');
template = template.replace("# REDIS_CACHE_LIFETIME=30", "REDIS_CACHE_LIFETIME=30");

console.log("[env]     Asking for Google OAuth Credential Keys...");
const githubClientId = readlineSync.question("[env]     Google Client ID: ");
template = template.replace("GOOGLE_CLIENT_ID=YOUR_GITHUB_CLIENT_ID", `GOOGLE_CLIENT_ID="${githubClientId}"`);

const githubClientSecret = readlineSync.question("[env]     Google Client Secret: ");
template = template.replace(
  "GOOGLE_CLIENT_SECRET=YOUR_GITHUB_CLIENT_SECRET",
  `GOOGLE_CLIENT_SECRET="${githubClientSecret}"`,
);

// Write
console.log("[env]     Writing config...");

const dotEnvPath = path.join(__dirname, "../.env");
fs.writeFileSync(dotEnvPath, template, "utf-8");

console.log("[env]     Config generated.");

if (SKIP_CONTAINER_BUILD) {
  console.log("[compose] No containers will be created. To create these containers, you can run:");
  console.log("[compose] npm run serv:up");
  console.log("[compose]");
  console.log("[compose] After you ran these services, you need to manually create the database inside");
  console.log("[compose] the db container and then you can run npm run db:push to push the schema to the database.");

  process.exit(0);
}

console.log("[compose] Creating containers via docker-compose.yml file...");

spawnSync("docker", ["compose", "up", "-d", ...COMPOSE_SERVICES_ENABLED], {
  cwd: path.join(__dirname, "../"),
  stdio: "inherit",
});

console.log("[compose] Containers successfully created.");

console.log("[db]      Wait 5s...");
setTimeout(function () {
  console.log("[db]      Creating database entry...");

  const dbUrl = new URL(`postgres://postgres:${dbPassword}@localhost:5432/postgres`).toString();
  console.log("[db]      Connecting to: %s...", dbUrl);

  generateDb(dbUrl, "jippy")
    .then(() => {
      console.log("[db]      Pushing db changes to database...");

      spawnSync("npm", ["run", "db:push"], {
        cwd: path.join(__dirname, "../"),
        stdio: "inherit",
      });

      console.log("[db]      Push succeeded.");
    })
    .catch((e) => {
      console.log("[db]      Push failed.", e);
    });
}, 5000);
