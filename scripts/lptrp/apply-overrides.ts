import fs from "node:fs";
import fsp from "node:fs/promises";

import { PATHS } from "./paths";
import type { GeocodeOverride, GeocodedStop } from "./types";

function overrideKey(override: GeocodeOverride): string | null {
  if (override.signage_no !== undefined) return `signage:${override.signage_no}`;
  if (override.location) return `location:${override.location.trim().toLowerCase()}`;
  return null;
}

function stopKey(stop: GeocodedStop): string {
  if (stop.signage_no !== null) return `signage:${stop.signage_no}`;
  return `location:${stop.location.trim().toLowerCase()}`;
}

async function main() {
  if (!fs.existsSync(PATHS.geocodedStops)) {
    throw new Error(`Geocoded stops not found. Run geocode first: ${PATHS.geocodedStops}`);
  }

  const geocoded = JSON.parse(
    await fsp.readFile(PATHS.geocodedStops, "utf-8"),
  ) as GeocodedStop[];

  let overrides: GeocodeOverride[] = [];
  if (fs.existsSync(PATHS.geocodeOverrides)) {
    overrides = JSON.parse(await fsp.readFile(PATHS.geocodeOverrides, "utf-8")) as GeocodeOverride[];
  } else {
    await fsp.writeFile(PATHS.geocodeOverrides, "[]\n", "utf-8");
    console.log(`Created empty overrides template: ${PATHS.geocodeOverrides}`);
  }

  const overrideMap = new Map<string, GeocodeOverride>();
  for (const override of overrides) {
    const key = overrideKey(override);
    if (!key) {
      console.warn("Skipping override without signage_no or location:", override);
      continue;
    }
    overrideMap.set(key, override);
  }

  const failed = geocoded.filter(
    (s) => s.geocode_confidence === "failed" || s.geocode_confidence === "low",
  );

  console.log("LPTRP override report");
  console.log(`  Total stops: ${geocoded.length}`);
  console.log(`  Failed/low before overrides: ${failed.length}`);
  console.log(`  Overrides loaded: ${overrideMap.size}`);

  if (failed.length > 0) {
    console.log("\nFailed/low stops:");
    for (const stop of failed.slice(0, 30)) {
      const label = stop.signage_no !== null ? `#${stop.signage_no}` : "(no signage)";
      console.log(`  ${label} ${stop.location}`);
    }
    if (failed.length > 30) {
      console.log(`  ... and ${failed.length - 30} more`);
    }
  }

  const final = geocoded.map((stop) => {
    const override = overrideMap.get(stopKey(stop));
    if (!override) return stop;

    return {
      ...stop,
      lat: override.lat,
      lng: override.lng,
      geocode_confidence: "manual" as const,
      geocode_display_name: override.note
        ? `manual override: ${override.note}`
        : "manual override",
    };
  });

  await fsp.writeFile(
    PATHS.geocodedStopsFinal,
    JSON.stringify(final, null, 2) + "\n",
    "utf-8",
  );

  const stillFailed = final.filter(
    (s) => s.geocode_confidence === "failed" || s.geocode_confidence === "low",
  );

  console.log(`\nOutput: ${PATHS.geocodedStopsFinal}`);
  console.log(`  Manual overrides applied: ${overrideMap.size}`);
  console.log(`  Still failed/low: ${stillFailed.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
