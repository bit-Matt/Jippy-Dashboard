import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const FIRST_TOWN_DIR = path.join(process.cwd(), "scripts", "first-town-routes");
export const OUTPUT_DIR = path.join(FIRST_TOWN_DIR, "output");

export const PATHS = {
  inputDir: FIRST_TOWN_DIR,
  outputDir: OUTPUT_DIR,
  routesConfig: path.join(FIRST_TOWN_DIR, "routes.config.json"),
  combinedOutput: path.join(OUTPUT_DIR, "first-town-routes.json"),
  failedGeocodes: path.join(OUTPUT_DIR, "failed-geocodes.json"),
  conversionSummary: path.join(OUTPUT_DIR, "conversion-summary.json"),
} as const;

export async function ensureOutputDir(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  }
}

export function perRouteOutputPath(slug: string): string {
  return path.join(OUTPUT_DIR, `${slug}.json`);
}
