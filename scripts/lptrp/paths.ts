import path from "node:path";

const LPTRP_SOURCE_DIR = path.join(process.cwd(), "secrets", "docs", "LPTRP-stops");
const LPTRP_OUTPUT_DIR = path.join(process.cwd(), "scripts", "lptrp");

export const PATHS = {
  sourceMd: path.join(LPTRP_SOURCE_DIR, "LPTRP_stops-cleaned.md"),
  parsedStops: path.join(LPTRP_OUTPUT_DIR, "parsed-stops.json"),
  geocodedStops: path.join(LPTRP_OUTPUT_DIR, "geocoded-stops.json"),
  failedGeocodes: path.join(LPTRP_OUTPUT_DIR, "failed-geocodes.json"),
  geocodeOverrides: path.join(LPTRP_OUTPUT_DIR, "geocode-overrides.json"),
  geocodedStopsFinal: path.join(LPTRP_OUTPUT_DIR, "geocoded-stops-final.json"),
} as const;
