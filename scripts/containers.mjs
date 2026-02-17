import fss from "node:fs";
import path from "node:path";

import * as utils from "./utils.mjs";

const __dirname = import.meta.dirname;

const root = path.join(__dirname, "../");
const flags = new Set(process.argv.slice(2));

async function main() {
  if (!fss.existsSync(path.join(root, ".env"))) {
    throw new Error("You don't have .env file. You can generate it using this command: npm run setup");
  }

  if (flags.has("--container-up")) {
    await utils.process.spawnAsync("docker", ["compose", "up", "-d"], {
      cwd: root,
    });

    return;
  }

  if (flags.has("--container-start")) {
    await utils.process.spawnAsync("docker", ["compose", "start"], {
      cwd: root,
    });

    return;
  }

  if (flags.has("--container-stop")) {
    await utils.process.spawnAsync("docker", ["compose", "stop"], {
      cwd: root,
    });

    return;
  }

  if (flags.has("--container-down")) {
    await utils.process.spawnAsync("docker", ["compose", "down"], {
      cwd: root,
    });

    return;
  }

  console.log("Usage: containers.mjs [--container-up|--container-start|--container-stop|--container-down]");
  console.log("  --container-up: Start containers");
  console.log("  --container-start: Start containers");
  console.log("  --container-stop: Stop containers");
  console.log("  --container-down: Stop and remove containers");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
