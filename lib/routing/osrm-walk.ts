// ---------------------------------------------------------------------------
// OSRM foot routing wrapper — pedestrian walking routes
// ---------------------------------------------------------------------------

import type { LatLng, WalkRouteResult, ValhallaManeuver } from "./types";
import { decodePolyline, encodePolyline } from "./polyline";

interface OsrmManeuver {
  type?: string;
  modifier?: string;
}

interface OsrmStep {
  distance?: number;
  duration?: number;
  name?: string;
  maneuver?: OsrmManeuver;
}

interface OsrmLeg {
  steps?: OsrmStep[];
}

interface OsrmRoute {
  geometry?: string;
  distance?: number;
  duration?: number;
  legs?: OsrmLeg[];
}

interface OsrmRouteResponse {
  routes?: OsrmRoute[];
  message?: string;
}

/** Map OSRM maneuver type strings to numeric codes expected by instruction-generator. */
function maneuverTypeCode(type: string | undefined): number {
  if (type === "depart") return 1;
  if (type === "arrive") return 4;
  return 10;
}

function formatStepInstruction(step: OsrmStep): string {
  const maneuver = step.maneuver;
  const type = maneuver?.type ?? "continue";
  const modifier = maneuver?.modifier;
  const name = step.name;

  if (type === "depart") {
    return name ? `Head ${modifier ?? "on"} ${name}` : "Head toward destination";
  }
  if (type === "arrive") {
    return "You have arrived at your destination";
  }

  const parts: string[] = [];
  if (modifier) parts.push(modifier);
  parts.push(type);
  if (name) parts.push(`onto ${name}`);
  return parts.join(" ").replace(/^\w/, (c) => c.toUpperCase());
}

async function fetchOsrmFoot(
  baseUrl: string,
  from: LatLng,
  to: LatLng,
  options: { withSteps: boolean; withGeometry: boolean },
): Promise<OsrmRoute> {
  const coordinates = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const url = new URL(`/route/v1/foot/${coordinates}`, baseUrl);
  url.searchParams.set("overview", options.withGeometry ? "full" : "false");
  url.searchParams.set("geometries", options.withGeometry ? "polyline6" : "polyline");
  url.searchParams.set("steps", options.withSteps ? "true" : "false");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`OSRM foot route failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OsrmRouteResponse;
  const route = payload.routes?.[0];
  if (!route) {
    throw new Error(payload.message ?? "OSRM foot response has no route.");
  }

  return route;
}

/**
 * Calls OSRM foot to compute a pedestrian walking route between two points.
 * Returns the encoded polyline (1e6 precision), distance (meters), duration (seconds), and maneuvers.
 */
export async function getWalkRoute(from: LatLng, to: LatLng): Promise<WalkRouteResult> {
  const osrmFootUrl = process.env.OSRM_FOOT_URL;
  if (!osrmFootUrl) {
    throw new Error("OSRM_FOOT_URL is not configured.");
  }

  const route = await fetchOsrmFoot(osrmFootUrl, from, to, {
    withSteps: true,
    withGeometry: true,
  });

  if (!route.geometry) {
    throw new Error("OSRM foot returned no route geometry.");
  }

  const coords = decodePolyline(route.geometry);
  if (coords.length < 2) {
    throw new Error("OSRM foot returned insufficient route coordinates.");
  }

  const steps = route.legs?.[0]?.steps ?? [];
  const maneuvers: ValhallaManeuver[] = steps.map((step) => ({
    type: maneuverTypeCode(step.maneuver?.type),
    instruction: formatStepInstruction(step),
    length: (step.distance ?? 0) / 1000,
    time: Math.round(step.duration ?? 0),
  }));

  return {
    polyline: encodePolyline(coords),
    distance: route.distance ?? 0,
    duration: Math.round(route.duration ?? 0),
    maneuvers,
  };
}

/**
 * Lightweight version that only returns the walking distance (meters) between
 * two points. Used by the graph builder to score candidate boarding points
 * with real road-network distances instead of geometric estimates.
 *
 * Returns Infinity if the route cannot be computed (so callers can skip it).
 */
export async function getWalkDistance(from: LatLng, to: LatLng): Promise<number> {
  const osrmFootUrl = process.env.OSRM_FOOT_URL;
  if (!osrmFootUrl) return Infinity;

  try {
    const route = await fetchOsrmFoot(osrmFootUrl, from, to, {
      withSteps: false,
      withGeometry: false,
    });
    return route.distance ?? Infinity;
  } catch {
    return Infinity;
  }
}
