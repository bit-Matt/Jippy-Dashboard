// ---------------------------------------------------------------------------
// Valhalla routing — used for tricycle ride segments
// ---------------------------------------------------------------------------

import type { LatLng, TricycleRouteResult } from "./types";
import { encodePolyline } from "./polyline";
import { haversineMeters } from "./graph-builder";
import { TRICYCLE_SPEED_KMH } from "./constants";

const POLYLINE_PRECISION = 1_000_000;

/**
 * Maximum ratio of Valhalla route distance to haversine distance.
 * If the route exceeds this, it likely loops outside the region and
 * we fall back to pedestrian costing or a straight-line estimate.
 */
const MAX_ROUTE_DETOUR_RATIO = 2.5;

interface ValhallaLeg {
  shape?: string;
  summary?: { length: number; time: number };
}

interface ValhallaRouteResponse {
  trip?: {
    legs?: ValhallaLeg[];
    summary?: { length: number; time: number };
  };
}

/**
 * Calls Valhalla to compute a tricycle route.
 * Tries `pedestrian` costing first (stays on local roads), then falls back to
 * `motorcycle` if pedestrian fails. If the route distance exceeds a detour
 * threshold relative to haversine, returns a straight-line estimate instead.
 */
export async function getTricycleRoute(from: LatLng, to: LatLng): Promise<TricycleRouteResult> {
  const valhallaUrl = process.env.NEXT_PUBLIC_VALHALLA_URL;
  if (!valhallaUrl) {
    throw new Error("NEXT_PUBLIC_VALHALLA_URL is not configured.");
  }

  const serviceUrl = new URL("/route", valhallaUrl);
  const straight = haversineMeters(from, to);

  // Try pedestrian costing first (stays on local roads, best for short tricycle rides),
  // then fall back to motorcycle if pedestrian fails or produces a bad route.
  const costings = ["pedestrian", "motorcycle"] as const;

  for (const costing of costings) {
    try {
      const result = await fetchValhallaRoute(serviceUrl.toString(), from, to, costing);
      // Reject routes that detour excessively — they likely leave the region
      if (result.distance > straight * MAX_ROUTE_DETOUR_RATIO) continue;
      return result;
    } catch {
      // Try next costing
    }
  }

  // All costings failed or produced excessive detours — return straight-line estimate
  return {
    polyline: encodePolyline([from, to]),
    distance: straight * 1.2,
    duration: Math.round((straight * 1.2) / (TRICYCLE_SPEED_KMH * 1000 / 3600)),
  };
}

/**
 * Fetches a single Valhalla route with the given costing model.
 */
async function fetchValhallaRoute(
  url: string,
  from: LatLng,
  to: LatLng,
  costing: string,
): Promise<TricycleRouteResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      costing,
      locations: [
        { lat: from[0], lon: from[1], type: "break" },
        { lat: to[0], lon: to[1], type: "break" },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Valhalla ${costing} route failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as ValhallaRouteResponse;
  const legs = payload.trip?.legs ?? [];
  if (legs.length === 0) {
    throw new Error(`Valhalla ${costing} response has no route legs.`);
  }

  const mergedCoords: Array<[number, number]> = [];
  let totalDistance = 0;
  let totalDuration = 0;

  for (const leg of legs) {
    if (leg.summary) {
      totalDistance += leg.summary.length * 1000; // km → m
      totalDuration += leg.summary.time;
    }

    if (!leg.shape) continue;
    const coords = decodeValhallaPolyline(leg.shape);
    if (coords.length === 0) continue;

    if (mergedCoords.length === 0) {
      mergedCoords.push(...coords);
    } else {
      mergedCoords.push(...coords.slice(1));
    }
  }

  // Fallback to trip-level summary if leg summaries were missing
  if (totalDistance === 0 && payload.trip?.summary) {
    totalDistance = payload.trip.summary.length * 1000;
    totalDuration = payload.trip.summary.time;
  }

  // Scale duration to tricycle speed (Valhalla pedestrian speed is ~5 km/h,
  // but tricycles travel at ~10 km/h)
  if (costing === "pedestrian" && totalDuration > 0) {
    totalDuration = Math.round(totalDistance / (TRICYCLE_SPEED_KMH * 1000 / 3600));
  }

  return {
    polyline: mergedCoords.length >= 2 ? encodePolyline(mergedCoords) : "",
    distance: totalDistance,
    duration: Math.round(totalDuration),
  };
}

// ---------------------------------------------------------------------------
// Valhalla polyline decoding (precision 1e6)
// ---------------------------------------------------------------------------

function decodeValhallaPolyline(encoded: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const latResult = decodeSingleValue(encoded, index);
    lat += latResult.value;
    index = latResult.nextIndex;

    const lngResult = decodeSingleValue(encoded, index);
    lng += lngResult.value;
    index = lngResult.nextIndex;

    coordinates.push([lat / POLYLINE_PRECISION, lng / POLYLINE_PRECISION]);
  }

  return coordinates;
}

function decodeSingleValue(
  encoded: string,
  startIndex: number,
): { value: number; nextIndex: number } {
  let result = 0;
  let shift = 0;
  let index = startIndex;

  while (true) {
    const byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
    if (byte < 0x20) break;
  }

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    nextIndex: index,
  };
}
