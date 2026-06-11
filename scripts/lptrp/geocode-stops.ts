import "dotenv/config";

import fs from "node:fs";
import fsp from "node:fs/promises";

import { ensureOutputDir, PATHS } from "./paths";
import type { GeocodeConfidence, GeocodedStop, ParsedStop } from "./types";

const ILOILO_BOUNDS = {
  latMin: 10.65,
  latMax: 10.8,
  lngMin: 122.45,
  lngMax: 122.6,
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: [string, string, string, string];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGeocodeQuery(stop: ParsedStop): string {
  const parts = [stop.location];
  if (stop.barangay) parts.push(stop.barangay);
  parts.push("Iloilo City", "Philippines");
  return parts.join(", ");
}

function isWithinBounds(lat: number, lng: number): boolean {
  return (
    lat >= ILOILO_BOUNDS.latMin &&
    lat <= ILOILO_BOUNDS.latMax &&
    lng >= ILOILO_BOUNDS.lngMin &&
    lng <= ILOILO_BOUNDS.lngMax
  );
}

async function geocodeQuery(
  baseUrl: string,
  query: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "Jippy-Dashboard-LPTRP-Geocoder/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed (${response.status}): ${query}`);
  }

  const results = (await response.json()) as NominatimResult[];
  if (!Array.isArray(results) || results.length === 0) return null;

  const top = results[0];
  const lat = Number.parseFloat(top.lat);
  const lng = Number.parseFloat(top.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng, displayName: top.display_name };
}

function toGeocodedStop(
  stop: ParsedStop,
  query: string,
  result: { lat: number; lng: number; displayName: string } | null,
): GeocodedStop {
  if (!result) {
    return {
      ...stop,
      lat: null,
      lng: null,
      geocode_confidence: "failed",
      geocode_query: query,
      geocode_display_name: null,
    };
  }

  const confidence: GeocodeConfidence = isWithinBounds(result.lat, result.lng)
    ? "high"
    : "low";

  return {
    ...stop,
    lat: result.lat,
    lng: result.lng,
    geocode_confidence: confidence,
    geocode_query: query,
    geocode_display_name: result.displayName,
  };
}

async function main() {
  const nominatimUrl = process.env.NEXT_PUBLIC_NOMINATIM_URL;
  if (!nominatimUrl) {
    throw new Error("NEXT_PUBLIC_NOMINATIM_URL is not set in .env");
  }

  if (!fs.existsSync(PATHS.parsedStops)) {
    throw new Error(`Parsed stops not found. Run parse first: ${PATHS.parsedStops}`);
  }

  const delayMs = Number.parseInt(process.env.LPTRP_GEOCODE_DELAY_MS ?? "200", 10);
  const stops = JSON.parse(await fsp.readFile(PATHS.parsedStops, "utf-8")) as ParsedStop[];

  const geocoded: GeocodedStop[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const query = buildGeocodeQuery(stop);

    process.stdout.write(`[${i + 1}/${stops.length}] ${query.slice(0, 80)}... `);

    try {
      const result = await geocodeQuery(nominatimUrl, query);
      const entry = toGeocodedStop(stop, query, result);
      geocoded.push(entry);
      console.log(entry.geocode_confidence);
    } catch (error) {
      console.log("error");
      geocoded.push(toGeocodedStop(stop, query, null));
      console.error(error);
    }

    if (i < stops.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const failed = geocoded.filter(
    (s) => s.geocode_confidence === "failed" || s.geocode_confidence === "low",
  );

  await ensureOutputDir();
  await fsp.writeFile(PATHS.geocodedStops, JSON.stringify(geocoded, null, 2) + "\n", "utf-8");
  await fsp.writeFile(PATHS.failedGeocodes, JSON.stringify(failed, null, 2) + "\n", "utf-8");

  const high = geocoded.filter((s) => s.geocode_confidence === "high").length;
  const low = geocoded.filter((s) => s.geocode_confidence === "low").length;
  const failedCount = geocoded.filter((s) => s.geocode_confidence === "failed").length;

  console.log("\nLPTRP geocode complete");
  console.log(`  Output: ${PATHS.geocodedStops}`);
  console.log(`  Failed/low report: ${PATHS.failedGeocodes}`);
  console.log(`  High confidence: ${high}`);
  console.log(`  Low confidence: ${low}`);
  console.log(`  Failed: ${failedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
