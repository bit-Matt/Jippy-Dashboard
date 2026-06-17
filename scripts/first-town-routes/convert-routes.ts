import "dotenv/config";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { encodePolyline } from "@/lib/routing/polyline";

import { parseGpxFile } from "./parse-gpx";
import { ensureOutputDir, PATHS, perRouteOutputPath } from "./paths";
import { sampleWaypoints } from "./sample-waypoints";
import type {
  ConversionSummary,
  FailedGeocode,
  FirstTownRoutesOutput,
  LatLng,
  RouteConfigEntry,
  RouteConversionSummary,
  RouteOutput,
  RoutesConfig,
  WaypointOutput,
} from "./types";

const DEFAULT_VEHICLE_TYPE_ID = "019d61b5-28b0-70a2-af78-cb86290477d0";
const DEFAULT_ROUTE_COLOR = "#2593d9";
const GEOCODE_DELAY_MS = 1100;
const WAYPOINT_TARGET_COUNT = 20;
const GPX_EXTENSIONS = new Set([".gpx", ".xml"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function filenameToSlug(filename: string): string {
  const parenMatch = filename.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1].trim() !== "1") {
    return slugify(parenMatch[1]);
  }

  const base = path.basename(filename).replace(/\.(gpx|xml)$/i, "");
  return slugify(base);
}

function formatCoordinateAddress(point: LatLng): string {
  return `${point[0].toFixed(6)}, ${point[1].toFixed(6)}`;
}

function getNominatimBaseUrl(): string {
  const baseUrl = process.env.NOMINATIM_URL ?? process.env.NEXT_PUBLIC_NOMINATIM_URL;
  if (!baseUrl) {
    throw new Error("NOMINATIM_URL or NEXT_PUBLIC_NOMINATIM_URL must be set in .env");
  }
  return baseUrl.replace(/\/$/, "");
}

async function reverseGeocode(
  baseUrl: string,
  point: LatLng,
): Promise<{ address: string } | { error: string }> {
  const url = new URL("/reverse", baseUrl);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(point[0]));
  url.searchParams.set("lon", String(point[1]));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "Jippy-Dashboard-FirstTown-Geocoder/1.0",
    },
  });

  if (!response.ok) {
    return { error: `Nominatim reverse failed (${response.status})` };
  }

  const data = (await response.json()) as { display_name?: string };
  if (!data.display_name) {
    return { error: "Nominatim reverse returned no display_name" };
  }

  return { address: data.display_name };
}

async function geocodeWaypoints(
  slug: string,
  routeName: string,
  waypoints: WaypointOutput[],
  baseUrl: string,
): Promise<{ waypoints: WaypointOutput[]; failures: FailedGeocode[] }> {
  const failures: FailedGeocode[] = [];
  const geocoded: WaypointOutput[] = [];

  for (let i = 0; i < waypoints.length; i++) {
    const waypoint = waypoints[i];
    console.log(
      "  geocoding %s point %d/%d (sequence %d)",
      slug,
      i + 1,
      waypoints.length,
      waypoint.sequence,
    );

    const result = await reverseGeocode(baseUrl, waypoint.point);
    if ("error" in result) {
      failures.push({
        slug,
        routeName,
        sequence: waypoint.sequence,
        point: waypoint.point,
        error: result.error,
      });
      geocoded.push({
        ...waypoint,
        address: formatCoordinateAddress(waypoint.point),
      });
    } else {
      geocoded.push({
        ...waypoint,
        address: result.address,
      });
    }

    if (i < waypoints.length - 1) {
      await sleep(GEOCODE_DELAY_MS);
    }
  }

  return { waypoints: geocoded, failures };
}

function loadRoutesConfig(): RoutesConfig {
  if (!fs.existsSync(PATHS.routesConfig)) return {};
  const raw = fs.readFileSync(PATHS.routesConfig, "utf-8");
  return JSON.parse(raw) as RoutesConfig;
}

function resolveRouteJobs(
  inputDir: string,
  config: RoutesConfig,
): Array<{ slug: string; sourceFile: string; config: RouteConfigEntry }> {
  const inputFiles = fs
    .readdirSync(inputDir)
    .filter((name) => GPX_EXTENSIONS.has(path.extname(name).toLowerCase()));

  const jobs: Array<{ slug: string; sourceFile: string; config: RouteConfigEntry }> = [];
  const usedFiles = new Set<string>();

  for (const [slug, entry] of Object.entries(config)) {
    if (entry.sourceFile) {
      if (!inputFiles.includes(entry.sourceFile)) {
        throw new Error(`Configured sourceFile not found: ${entry.sourceFile}`);
      }
      jobs.push({ slug, sourceFile: entry.sourceFile, config: entry });
      usedFiles.add(entry.sourceFile);
    }
  }

  for (const sourceFile of inputFiles) {
    if (usedFiles.has(sourceFile)) continue;
    const slug = filenameToSlug(sourceFile);
    jobs.push({
      slug,
      sourceFile,
      config: config[slug] ?? {},
    });
  }

  return jobs.sort((a, b) => a.slug.localeCompare(b.slug));
}

function buildRouteOutput(
  slug: string,
  parsedName: string,
  parsedDescription: string,
  parsedStrokeColor: string,
  config: RouteConfigEntry,
  polylineGoingTo: string,
  goingTo: WaypointOutput[],
): RouteOutput {
  return {
    routeNumber: config.routeNumber ?? slug.toUpperCase(),
    routeName: config.routeName ?? parsedName ?? slug,
    routeColor: config.routeColor ?? parsedStrokeColor ?? DEFAULT_ROUTE_COLOR,
    routeDetails: config.routeDetails ?? parsedDescription ?? "",
    availableFrom: "00:00",
    availableTo: "23:59",
    vehicleTypeId: config.vehicleTypeId ?? DEFAULT_VEHICLE_TYPE_ID,
    points: {
      polylineGoingTo,
      goingTo,
      polylineGoingBack: "",
      goingBack: [],
    },
  };
}

async function convertRoute(
  slug: string,
  sourceFile: string,
  config: RouteConfigEntry,
  nominatimUrl: string,
): Promise<{
  route: RouteOutput;
  perRoutePayload: FirstTownRoutesOutput;
  summary: RouteConversionSummary;
  failures: FailedGeocode[];
}> {
  const filePath = path.join(PATHS.inputDir, sourceFile);
  console.log("converting %s from %s", slug, sourceFile);

  const parsed = await parseGpxFile(filePath);
  const coords = parsed.dedupedPoints.map((p) => [p.lat, p.lng] as LatLng);
  const polylineGoingTo = encodePolyline(coords);
  const { waypoints, sampledIndices } = sampleWaypoints(parsed.dedupedPoints, WAYPOINT_TARGET_COUNT);
  const { waypoints: geocodedWaypoints, failures } = await geocodeWaypoints(
    slug,
    config.routeName ?? parsed.name ?? slug,
    waypoints,
    nominatimUrl,
  );

  const route = buildRouteOutput(
    slug,
    parsed.name,
    parsed.description,
    parsed.strokeColor,
    config,
    polylineGoingTo,
    geocodedWaypoints,
  );

  const perRoutePayload: FirstTownRoutesOutput = {
    ok: true,
    data: { routes: [route] },
  };

  const summary: RouteConversionSummary = {
    slug,
    sourceFile,
    routeName: route.routeName,
    rawPointCount: parsed.points.length,
    dedupedPointCount: parsed.dedupedPoints.length,
    sampledIndices,
    waypointCount: geocodedWaypoints.length,
    geocodeFailures: failures.length,
  };

  return { route, perRoutePayload, summary, failures };
}

async function main() {
  await ensureOutputDir();

  const routesConfig = loadRoutesConfig();
  const jobs = resolveRouteJobs(PATHS.inputDir, routesConfig);
  if (jobs.length === 0) {
    throw new Error(`No GPX/XML files found in ${PATHS.inputDir}`);
  }

  const nominatimUrl = getNominatimBaseUrl();
  const routes: RouteOutput[] = [];
  const summaries: RouteConversionSummary[] = [];
  const allFailures: FailedGeocode[] = [];

  for (const job of jobs) {
    const result = await convertRoute(job.slug, job.sourceFile, job.config, nominatimUrl);
    routes.push(result.route);
    summaries.push(result.summary);
    allFailures.push(...result.failures);

    await fsp.writeFile(
      perRouteOutputPath(job.slug),
      JSON.stringify(result.perRoutePayload, null, 2),
      "utf-8",
    );
  }

  const combined: FirstTownRoutesOutput = {
    ok: true,
    data: { routes },
  };

  const conversionSummary: ConversionSummary = {
    convertedAt: new Date().toISOString(),
    routeCount: routes.length,
    totalGeocodeFailures: allFailures.length,
    routes: summaries,
  };

  await fsp.writeFile(PATHS.combinedOutput, JSON.stringify(combined, null, 2), "utf-8");
  await fsp.writeFile(PATHS.conversionSummary, JSON.stringify(conversionSummary, null, 2), "utf-8");
  await fsp.writeFile(PATHS.failedGeocodes, JSON.stringify(allFailures, null, 2), "utf-8");

  console.log("converted %d route(s)", routes.length);
  console.log("combined output: %s", PATHS.combinedOutput);
  console.log("geocode failures: %d", allFailures.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
