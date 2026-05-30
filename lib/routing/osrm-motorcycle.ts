// ---------------------------------------------------------------------------
// OSRM bicycle routing — used for tricycle ride segments
// ---------------------------------------------------------------------------

import type { LatLng, TricycleRouteResult } from "./types";
import { decodePolyline, encodePolyline } from "./polyline";
import { haversineMeters } from "./graph-builder";
import { TRICYCLE_SPEED_KMH } from "./constants";

/**
 * Maximum ratio of route distance to haversine distance.
 * If the route exceeds this, it likely loops outside the region and
 * we fall back to a straight-line estimate.
 */
const MAX_ROUTE_DETOUR_RATIO = 2.5;

interface OsrmRoute {
  geometry?: string;
  distance?: number;
  duration?: number;
}

interface OsrmRouteResponse {
  routes?: OsrmRoute[];
  message?: string;
}

/**
 * Calls OSRM bicycle to compute a tricycle route.
 * If the route distance exceeds a detour threshold relative to haversine,
 * returns a straight-line estimate instead.
 */
export async function getTricycleRoute(from: LatLng, to: LatLng): Promise<TricycleRouteResult> {
  const osrmBicycleUrl = process.env.OSRM_BICYCLE_URL;
  if (!osrmBicycleUrl) {
    throw new Error("OSRM_BICYCLE_URL is not configured.");
  }

  const straight = haversineMeters(from, to);

  try {
    const result = await fetchOsrmRoute(osrmBicycleUrl, from, to);
    if (result.distance <= straight * MAX_ROUTE_DETOUR_RATIO) {
      return result;
    }
  } catch {
    // fall through to straight-line estimate
  }

  return {
    polyline: encodePolyline([from, to]),
    distance: straight * 1.2,
    duration: Math.round((straight * 1.2) / (TRICYCLE_SPEED_KMH * 1000 / 3600)),
  };
}

async function fetchOsrmRoute(
  baseUrl: string,
  from: LatLng,
  to: LatLng,
): Promise<TricycleRouteResult> {
  const coordinates = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const url = new URL(`/route/v1/driving/${coordinates}`, baseUrl);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "polyline6");
  url.searchParams.set("steps", "false");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`OSRM bicycle route failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OsrmRouteResponse;
  const route = payload.routes?.[0];
  if (!route?.geometry) {
    throw new Error(payload.message ?? "OSRM bicycle response has no route geometry.");
  }

  const coords = decodePolyline(route.geometry);
  if (coords.length < 2) {
    throw new Error("OSRM bicycle returned insufficient route coordinates.");
  }

  const distance = route.distance ?? 0;
  const duration = route.duration ?? 0;

  return {
    polyline: encodePolyline(coords),
    distance,
    duration: Math.round(duration),
  };
}
