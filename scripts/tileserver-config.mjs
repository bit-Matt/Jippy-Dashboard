import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

const __dirname = import.meta.dirname;

const templates = [
  path.join(__dirname, "./tileserver/style.template.json"),
  path.join(__dirname, "./tileserver/liberty.template.json"),
];

for (const templatePath of templates) {
  let template = fs.readFileSync(templatePath, "utf-8");

  template = template.replaceAll("{TILESERVER_HOSTNAME}", process.env.TILESERVER_URL);
  template = template.replaceAll("{ASSET_HOSTNAME}", process.env.BETTER_AUTH_URL);

  const templateWritePath = path.join(__dirname, `../public/tileserver/${path.basename(templatePath).replace(".template", "")}`);
  fs.writeFileSync(templateWritePath, template, "utf-8");
}
