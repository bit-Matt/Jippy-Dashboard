import "dotenv/config";

import fsp from "node:fs/promises";
import path from "node:path";

const __dirname = import.meta.dirname;

// Tileserver template
const templatePath = path.join(__dirname, "./tileserver/style.template.json");
let template = await fsp.readFile(templatePath, { encoding: "utf-8" });

template = template.replaceAll("{TILESERVER_HOSTNAME}", process.env.NEXT_PUBLIC_TILESERVER_URL);
template = template.replaceAll("{ASSET_HOSTNAME}", process.env.BETTER_AUTH_URL);

const templateWritePath = path.join(__dirname, "../public/tileserver/style.json");
await fsp.writeFile(templateWritePath, template, { encoding: "utf-8" });
