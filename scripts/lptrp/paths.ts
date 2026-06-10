import path from "node:path";

export const LPTRP_DIR = path.join(process.cwd(), "secrets", "docs", "LPTRP-stops");

export const PATHS = {
  sourceMd: path.join(LPTRP_DIR, "LPTRP_stops-cleaned.md"),
  parsedStops: path.join(LPTRP_DIR, "parsed-stops.json"),
  geocodedStops: path.join(LPTRP_DIR, "geocoded-stops.json"),
  failedGeocodes: path.join(LPTRP_DIR, "failed-geocodes.json"),
  geocodeOverrides: path.join(LPTRP_DIR, "geocode-overrides.json"),
  geocodedStopsFinal: path.join(LPTRP_DIR, "geocoded-stops-final.json"),
} as const;
