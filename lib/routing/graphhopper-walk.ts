// ---------------------------------------------------------------------------
// GraphHopper pedestrian routing wrapper
// ---------------------------------------------------------------------------

import type { LatLng, WalkRouteResult, ValhallaManeuver } from "./types";
import { encodePolyline } from "./polyline";

interface GraphHopperInstruction {
  text: string;
  sign: number;
  distance: number; // meters
  time: number; // milliseconds
}

interface GraphHopperPath {
  distance: number; // meters
  time: number; // milliseconds
  points: {
    type: string;
    coordinates: [number, number][]; // [lng, lat]
  };
  instructions?: GraphHopperInstruction[];
}

interface GraphHopperResponse {
  paths?: GraphHopperPath[];
}

// GraphHopper sign code for the final "arrive" instruction
const GH_FINISH = 4;

/**
 * Calls GraphHopper to compute a pedestrian walking route between two points.
 * Returns the encoded polyline, distance (meters), duration (seconds), and maneuvers.
 */
export async function getWalkRoute(from: LatLng, to: LatLng): Promise<WalkRouteResult> {
  const graphhopperUrl = process.env.GRAPHHOPPER_URL;
  if (!graphhopperUrl) {
    throw new Error("GRAPHHOPPER_URL is not configured.");
  }

  const url = new URL("/route", graphhopperUrl);
  url.searchParams.set("point", `${from[0]},${from[1]}`);
  url.searchParams.append("point", `${to[0]},${to[1]}`);
  url.searchParams.set("profile", "foot");
  url.searchParams.set("instructions", "true");
  url.searchParams.set("points_encoded", "false");
  url.searchParams.set("locale", "en");

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`GraphHopper pedestrian route failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GraphHopperResponse;
  const paths = payload.paths ?? [];
  if (paths.length === 0) {
    throw new Error("GraphHopper returned no walk route paths.");
  }

  const path = paths[0];

  // Convert [lng, lat] GeoJSON coordinates to [lat, lng] for our polyline encoder
  const coords: Array<[number, number]> = (path.points?.coordinates ?? []).map(
    ([lng, lat]) => [lat, lng] as [number, number],
  );

  // Map GraphHopper instructions to ValhallaManeuver format so the downstream
  // instruction generator (which maps type codes to depart/arrive/turn) keeps working.
  const maneuvers: ValhallaManeuver[] = (path.instructions ?? []).map((instr, idx) => {
    let type: number;
    if (idx === 0) {
      type = 1; // maps to Valhalla kStart → "depart"
    } else if (instr.sign === GH_FINISH) {
      type = 4; // maps to Valhalla kDestination → "arrive"
    } else {
      type = 10; // falls through to "turn"
    }

    return {
      type,
      instruction: instr.text,
      length: instr.distance / 1000, // meters → km (matches Valhalla convention)
      time: Math.round(instr.time / 1000), // ms → seconds
    };
  });

  return {
    polyline: coords.length >= 2 ? encodePolyline(coords) : "",
    distance: path.distance ?? 0, // already in meters
    duration: Math.round((path.time ?? 0) / 1000), // ms → seconds
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
  const graphhopperUrl = process.env.GRAPHHOPPER_URL;
  if (!graphhopperUrl) return Infinity;

  const url = new URL("/route", graphhopperUrl);
  url.searchParams.set("point", `${from[0]},${from[1]}`);
  url.searchParams.append("point", `${to[0]},${to[1]}`);
  url.searchParams.set("profile", "foot");
  url.searchParams.set("instructions", "false");
  url.searchParams.set("calc_points", "false");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return Infinity;

  const payload = (await response.json()) as GraphHopperResponse;
  const paths = payload.paths ?? [];
  if (paths.length === 0) return Infinity;

  return paths[0].distance ?? Infinity;
}
