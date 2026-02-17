import path from "node:path";

import * as utils from "./utils.mjs";

const __dirname = import.meta.dirname;
const flags = new Set(process.argv.slice(2));

async function main() {
  // Token generation for authentication
  const token = utils.token.generatePassword(32, "!#%&()*+,/:;<=>?@[]^`{|}");
  utils.env.write("runtime.better.auth.token", token);

  // Database configuration
  const databaseUsername = await utils.env.ask(
    "Your PostgreSQL username",
    "runtime.postgres.username",
    "postgres",
  );

  let databasePassword;
  if (flags.has("--use-own-deployments")) {
    databasePassword = await utils.env.ask("Your PostgreSQL password", "runtime.postgres.password");

    if (!databasePassword) {
      console.error("Password cannot be empty!");
      process.exit(1);
    }
  } else {
    databasePassword = utils.token.generatePassword(32);
    utils.env.write("runtime.postgres.password", databasePassword);
  }

  const databaseName = await utils.env.ask(
    "Your PostgreSQL database name",
    "runtime.postgres.db",
    "jippy",
  );

  const databaseHost = await utils.env.ask(
    "Your PostgreSQL host",
    "runtime.postgres.host",
    "localhost",
  );

  const databasePort = await utils.env.ask(
    "Your PostgreSQL port",
    "runtime.postgres.port",
    "5432",
  );

  // Configure nominatim
  if (flags.has("--use-own-deployments")) {
    await utils.env.ask(
      "Nominatim instance URL",
      "runtime.nominatim.url",
      "https://nominatim.openstreetmap.org",
    );

    await utils.env.ask(
      "Valhalla Instance URL",
      "runtime.valhalla.url",
      "https://valhalla1.openstreetmap.de",
    );
  } else {
    utils.env.write("runtime.nominatim.url", "http://localhost:6701");
    utils.env.write("runtime.valhalla.url", "http://localhost:6702");
  }

  // Generate a connection string
  const dbConnectionOptions = {
    username: databaseUsername,
    password: databasePassword,
    host: databaseHost,
    port: databasePort,
    name: databaseName,
    query: { schema: "public" },
  };

  utils.env.write("runtime.postgres.url", utils.db.createConnectionString(dbConnectionOptions));

  // Nominatim DSN
  const nominatimDSN = `pgsql:dbname=nominatim;host=db;user=${databaseUsername};password=${databasePassword}`;
  utils.env.write("runtime.nominatim.database.dsn", nominatimDSN);

  // Write to root
  await utils.env.export(path.join(__dirname, "../.env"));

  if (flags.has("--use-own-deployments")) {
    console.log("");
    console.log("Successfully generated .env file!");
    console.log("The rest of the configuration should be done on your end. Here's what you should do next:");
    console.log("");
    console.log("  1. Create a database called: %s", databaseName);
    console.log("  2. Add a extension on that database called: postgis");
    console.log("  3. Push database schema to your database: npm run db:push");
    console.log("");
    console.log("Optional and recommended (If you want to avoid rate limits):");
    console.log("  - If you want to self-host nominatim, see this: https://nominatim.org/release-docs/latest/admin/Installation/");
    console.log("    Once you're done, update NOMINATIM_URL in .env file to your instance url.");
    console.log("  - If you want to self-host osrm, see this: https://github.com/Project-OSRM/osrm-backend");
    console.log("    Once you're done, update OSRM_URL in .env file to your instance url.");
    console.log("");
    console.log("Here's a brief explainer of what those scripts do:");
    console.log("  db:migrate  - Migrates the database schema to the latest version");
    console.log("  db:generate - Generates a new migration file.");
    console.log("  db:push     - Pushes the database schema to the database");
    console.log("  db:studio   - Launches drizzle studio");
    console.log("");
    console.log("  Note: service:* scripts WILL NOT WORK because you skipped the part where you let docker");
    console.log("        create the services for you. So you'll have to configure the dependencies manually.");
    console.log("");
    console.log("Happy coding!");
    console.log("");
  } else {
    // Download required files for any osm related applications
    console.log("Downloading required files for nominatim and osrm...");
    await utils.db.preNominatimConfigure();

    // Run the docker-compose
    console.log("Running docker-compose...");
    console.log("  Note: Sit back and relax while we configure everything for you. This will take a while...");
    console.log("        Give it around 30 minutes to 1 hour depending on your internet connection and hardware.");
    await utils.process.spawnAsync(
      "docker",
      [
        "compose",
        "up", "-d", "--wait",
      ], {
        cwd: path.join(__dirname, "../"),
      });

    console.log("Wait 5s...");
    await utils.timers.wait(5);

    console.log("Creating database...");
    await utils.db.setupDatabase(dbConnectionOptions);

    console.log("Wait 5s...");
    await utils.timers.wait(5);

    console.log("Enabling PostGIS extension...");
    await utils.db.enablePostgisExtension(dbConnectionOptions);

    console.log("Wait 5s...");
    await utils.timers.wait(5);

    console.log("Pushing database schema...");
    await utils.process.spawnAsync("npm", ["run", "db:push"], {
      cwd: path.join(__dirname, "../"),
    });

    console.log("");
    console.log("Successfully generated .env file!");
    console.log("You may run 'service:*' and 'db:*' scripts on npm without running the setup again.");
    console.log("");
    console.log("Here's a brief explainer of what those scripts do:");
    console.log("  service:up    - Builds and creates all services and networks for you");
    console.log("  service:down  - Removes all services and removes all networks");
    console.log("  service:start - Starts all services without needing to build them again.");
    console.log("                  (Implies you already service:up it before and you just stopped it)");
    console.log("  service:stop  - Stops all services without removing them.");
    console.log("  db:migrate    - Migrates the database schema to the latest version");
    console.log("  db:generate   - Generates a new migration file.");
    console.log("  db:push       - Pushes the database schema to the database");
    console.log("  db:studio     - Launches drizzle studio");
    console.log("");
    console.log("Happy coding!");
    console.log("");
  }
}

main().catch(console.error);
