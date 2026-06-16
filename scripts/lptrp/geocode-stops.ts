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

function expandBarangayName(value: string): string {
  return value
    .replace(/^Bo\.\s*/i, "Barrio ")
    .replace(/^Brgy\.?\s*/i, "Barangay ");
}

function extractBarangayFromLocation(location: string): string | null {
  const match = location.match(/\b(?:Bo\.|Barrio|Brgy\.?|Barangay)\s+([A-Za-z][A-Za-z0-9-]*)/i);
  return match ? `Barrio ${match[1]}` : null;
}

function extractStreet(location: string): string | null {
  const match = location.match(
    /^([A-Za-z0-9.\s]+?\b(?:St\.?|Street|Ave\.?|Avenue|Road|Rd\.?|Highway|Hwy\.?|Bridge|Extension|Ext\.?))\b/i,
  );
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

function buildGeocodeQueries(stop: ParsedStop): string[] {
  const citySuffix = "Iloilo City, Philippines";
  const barangay =
    (stop.barangay ? expandBarangayName(stop.barangay) : null) ??
    extractBarangayFromLocation(stop.location);
  const street = extractStreet(stop.location);

  const queries: string[] = [];

  const fullParts = [stop.location, stop.barangay, citySuffix].filter(Boolean);
  queries.push(fullParts.join(", "));

  if (street && barangay) {
    queries.push(`${street}, ${barangay}, ${citySuffix}`);
  }
  if (street) {
    queries.push(`${street}, ${citySuffix}`);
  }
  if (barangay) {
    queries.push(`${barangay}, ${citySuffix}`);
  }

  return [...new Set(queries)];
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
  url.searchParams.set("countrycodes", "ph");

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
  exactQuery: string,
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

  const withinBounds = isWithinBounds(result.lat, result.lng);
  const confidence: GeocodeConfidence = !withinBounds
    ? "low"
    : query === exactQuery
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

async function geocodeWithFallback(
  baseUrl: string,
  queries: string[],
  delayMs: number,
): Promise<{ query: string; result: { lat: number; lng: number; displayName: string } } | null> {
  for (let i = 0; i < queries.length; i++) {
    const result = await geocodeQuery(baseUrl, queries[i]);
    if (result) return { query: queries[i], result };
    if (i < queries.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return null;
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
    const queries = buildGeocodeQueries(stop);
    const exactQuery = queries[0];

    process.stdout.write(`[${i + 1}/${stops.length}] ${exactQuery.slice(0, 80)}... `);

    try {
      const match = await geocodeWithFallback(nominatimUrl, queries, delayMs);
      const entry = toGeocodedStop(
        stop,
        match?.query ?? exactQuery,
        match?.result ?? null,
        exactQuery,
      );
      geocoded.push(entry);
      const suffix =
        entry.geocode_confidence === "failed"
          ? "failed"
          : match && match.query !== exactQuery
            ? `${entry.geocode_confidence} (fallback)`
            : entry.geocode_confidence;
      console.log(suffix);
    } catch (error) {
      console.log("error");
      geocoded.push(toGeocodedStop(stop, exactQuery, null, exactQuery));
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
