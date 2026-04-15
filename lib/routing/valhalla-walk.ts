// ---------------------------------------------------------------------------
// Valhalla pedestrian routing wrapper
// ---------------------------------------------------------------------------

import type { LatLng, WalkRouteResult, ValhallaManeuver } from "./types";
import { decodePolyline, encodePolyline } from "./polyline";

interface ValhallaWalkLeg {
  shape?: string;
  summary?: { length: number; time: number };
  maneuvers?: Array<{
    type: number;
    instruction: string;
    length: number; // km
    time: number; // seconds
  }>;
}

interface ValhallaWalkResponse {
  trip?: {
    legs?: ValhallaWalkLeg[];
    summary?: { length: number; time: number };
  };
}

/**
 * Calls Valhalla to compute a pedestrian walking route between two points.
 * Returns the encoded polyline, distance (meters), duration (seconds), and maneuvers.
 */
export async function getWalkRoute(from: LatLng, to: LatLng): Promise<WalkRouteResult> {
  const valhallaUrl = process.env.NEXT_PUBLIC_VALHALLA_URL;
  if (!valhallaUrl) {
    throw new Error("NEXT_PUBLIC_VALHALLA_URL is not configured.");
  }

  const serviceUrl = new URL("/route", valhallaUrl);
  const response = await fetch(serviceUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      costing: "pedestrian",
      locations: [
        { lat: from[0], lon: from[1], type: "break" },
        { lat: to[0], lon: to[1], type: "break" },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Valhalla pedestrian route failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as ValhallaWalkResponse;
  const legs = payload.trip?.legs ?? [];
  if (legs.length === 0) {
    throw new Error("Valhalla returned no walk route legs.");
  }

  // Merge leg shapes
  const mergedCoords: Array<[number, number]> = [];
  const allManeuvers: ValhallaManeuver[] = [];

  for (const leg of legs) {
    if (leg.shape) {
      const coords = decodePolyline(leg.shape);
      if (mergedCoords.length === 0) {
        mergedCoords.push(...coords);
      } else {
        mergedCoords.push(...coords.slice(1));
      }
    }
    if (leg.maneuvers) {
      for (const m of leg.maneuvers) {
        allManeuvers.push({
          type: m.type,
          instruction: m.instruction,
          length: m.length,
          time: m.time,
        });
      }
    }
  }

  const summary = payload.trip?.summary ?? legs[0]?.summary;
  const distanceKm = summary?.length ?? 0;
  const durationSec = summary?.time ?? 0;

  return {
    polyline: mergedCoords.length >= 2 ? encodePolyline(mergedCoords) : "",
    distance: distanceKm * 1000, // convert km → meters
    duration: Math.round(durationSec),
    maneuvers: allManeuvers,
  };
}
