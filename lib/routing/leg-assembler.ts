// ---------------------------------------------------------------------------
// Leg assembly: converts A* path segments into structured RouteLeg objects
// ---------------------------------------------------------------------------

import turfBbox from "@turf/bbox";
import { point as turfPoint, lineString as turfLineString, polygon as turfPolygon } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

import { encodePolyline } from "@/lib/routing/polyline";
import { getWalkRoute } from "@/lib/routing/graphhopper-walk";
import { haversineMeters } from "@/lib/routing/graph-builder";
import {
  generateWalkInstructions,
  generateTricycleInstructions,
  generateJeepneyInstructions,
  generateTransferInstruction,
} from "@/lib/routing/instruction-generator";
import {
  JEEPNEY_SPEED_KMH,
  TRICYCLE_SPEED_KMH,
} from "./constants";
import type {
  Graph,
  LatLng,
  PathSegment,
  RouteLeg,
  TransitRegion,
} from "./types";

// ---------------------------------------------------------------------------
// Build a pure walk-only route (fallback)
// ---------------------------------------------------------------------------

export async function buildWalkOnlyRoute(from: LatLng, to: LatLng): Promise<RouteLeg[]> {
  const walk = await getWalkRoute(from, to);
  const instructions = generateWalkInstructions(walk.maneuvers);
  const bbox = computeBbox([[from[1], from[0]], [to[1], to[0]]]);

  return [{
    type: "WALK",
    route_name: null,
    polyline: walk.polyline,
    color: null,
    distance: walk.distance,
    duration: walk.duration,
    instructions,
    bbox,
  }];
}

// ---------------------------------------------------------------------------
// Build access leg (from user start to first boarding node)
// ---------------------------------------------------------------------------

export async function buildAccessLeg(
  start: LatLng,
  firstBoardingNode: LatLng,
  regions: TransitRegion[],
): Promise<RouteLeg[]> {
  // Option A: Walk directly
  const walkDirect = await getWalkRoute(start, firstBoardingNode);

  // Option B: Check if tricycle is more efficient
  const tricycleOption = findTricycleOption(start, firstBoardingNode, regions);

  if (tricycleOption && tricycleOption.totalCost < walkDirect.distance) {
    // Use tricycle: walk to station + ride tricycle to boarding node
    const legs: RouteLeg[] = [];

    // Walk to station
    const walkToStation = await getWalkRoute(start, tricycleOption.stationPoint);
    legs.push({
      type: "WALK",
      route_name: null,
      polyline: walkToStation.polyline,
      color: null,
      distance: walkToStation.distance,
      duration: walkToStation.duration,
      instructions: generateWalkInstructions(walkToStation.maneuvers),
      bbox: computeBbox([[start[1], start[0]], [tricycleOption.stationPoint[1], tricycleOption.stationPoint[0]]]),
    });

    // Tricycle ride
    const tricycleDistance = tricycleOption.rideDistance;
    const tricycleDuration = Math.round(tricycleDistance / (TRICYCLE_SPEED_KMH * 1000 / 3600));
    const tricyclePolyline = encodePolyline([tricycleOption.stationPoint, firstBoardingNode]);
    legs.push({
      type: "TRICYCLE",
      route_name: tricycleOption.stationName,
      polyline: tricyclePolyline,
      color: null,
      distance: tricycleDistance,
      duration: tricycleDuration,
      instructions: generateTricycleInstructions(tricycleOption.stationName),
      bbox: computeBbox([
        [tricycleOption.stationPoint[1], tricycleOption.stationPoint[0]],
        [firstBoardingNode[1], firstBoardingNode[0]],
      ]),
    });

    return legs;
  }

  // Direct walk
  return [{
    type: "WALK",
    route_name: null,
    polyline: walkDirect.polyline,
    color: null,
    distance: walkDirect.distance,
    duration: walkDirect.duration,
    instructions: generateWalkInstructions(walkDirect.maneuvers),
    bbox: computeBbox([[start[1], start[0]], [firstBoardingNode[1], firstBoardingNode[0]]]),
  }];
}

// ---------------------------------------------------------------------------
// Build transit (jeepney) legs from path segments
// ---------------------------------------------------------------------------

export async function buildTransitLegs(
  segments: PathSegment[],
  graph: Graph,
): Promise<RouteLeg[]> {
  const legs: RouteLeg[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.nodes.length < 2) continue;

    // Encode the segment polyline
    const coords: Array<[number, number]> = segment.nodes.map((n) => [n.lat, n.lng]);
    const polyline = encodePolyline(coords);

    // Calculate distance
    let distance = 0;
    for (let j = 0; j < coords.length - 1; j++) {
      distance += haversineMeters(coords[j], coords[j + 1]);
    }

    // Duration estimate
    const duration = Math.round(distance / (JEEPNEY_SPEED_KMH * 1000 / 3600));

    // Instructions
    const instructions = await generateJeepneyInstructions(segment, distance);

    // If there's a next segment (transfer), add transfer instruction
    if (i < segments.length - 1) {
      const nextSegment = segments[i + 1];
      instructions.push(generateTransferInstruction(segment.routeName, nextSegment.routeName));
    }

    // Bbox
    const geoJsonCoords = coords.map(([lat, lng]) => [lng, lat] as [number, number]);
    const bbox = computeBbox(geoJsonCoords);

    legs.push({
      type: "JEEPNEY",
      route_name: segment.routeName,
      polyline,
      color: segment.routeColor,
      distance,
      duration,
      instructions,
      bbox,
    });
  }

  return legs;
}

// ---------------------------------------------------------------------------
// Build egress leg (from last alighting node to user destination)
// ---------------------------------------------------------------------------

export async function buildEgressLeg(
  lastAlightNode: LatLng,
  destination: LatLng,
  regions: TransitRegion[],
): Promise<RouteLeg[]> {
  // Option A: Walk directly
  const walkDirect = await getWalkRoute(lastAlightNode, destination);

  // Option B: Check tricycle
  const tricycleOption = findTricycleOption(lastAlightNode, destination, regions);

  if (tricycleOption && tricycleOption.totalCost < walkDirect.distance) {
    const legs: RouteLeg[] = [];

    // Tricycle ride to near destination
    const tricycleDistance = tricycleOption.rideDistance;
    const tricycleDuration = Math.round(tricycleDistance / (TRICYCLE_SPEED_KMH * 1000 / 3600));
    const tricyclePolyline = encodePolyline([lastAlightNode, tricycleOption.stationPoint]);
    legs.push({
      type: "TRICYCLE",
      route_name: tricycleOption.stationName,
      polyline: tricyclePolyline,
      color: null,
      distance: tricycleDistance,
      duration: tricycleDuration,
      instructions: generateTricycleInstructions(tricycleOption.stationName),
      bbox: computeBbox([
        [lastAlightNode[1], lastAlightNode[0]],
        [tricycleOption.stationPoint[1], tricycleOption.stationPoint[0]],
      ]),
    });

    // Walk from station to destination
    const walkFromStation = await getWalkRoute(tricycleOption.stationPoint, destination);
    legs.push({
      type: "WALK",
      route_name: null,
      polyline: walkFromStation.polyline,
      color: null,
      distance: walkFromStation.distance,
      duration: walkFromStation.duration,
      instructions: generateWalkInstructions(walkFromStation.maneuvers),
      bbox: computeBbox([
        [tricycleOption.stationPoint[1], tricycleOption.stationPoint[0]],
        [destination[1], destination[0]],
      ]),
    });

    return legs;
  }

  // Direct walk
  return [{
    type: "WALK",
    route_name: null,
    polyline: walkDirect.polyline,
    color: null,
    distance: walkDirect.distance,
    duration: walkDirect.duration,
    instructions: generateWalkInstructions(walkDirect.maneuvers),
    bbox: computeBbox([[lastAlightNode[1], lastAlightNode[0]], [destination[1], destination[0]]]),
  }];
}

// ---------------------------------------------------------------------------
// Tricycle option evaluation
// ---------------------------------------------------------------------------

interface TricycleOption {
  stationName: string;
  stationPoint: LatLng;
  walkToStationDistance: number;
  rideDistance: number;
  totalCost: number;
}

function findTricycleOption(
  from: LatLng,
  to: LatLng,
  regions: TransitRegion[],
): TricycleOption | null {
  let bestOption: TricycleOption | null = null;

  for (const region of regions) {
    if (region.stations.length === 0 || region.points.length < 3) continue;

    // Build region polygon for geofence check
    const sorted = [...region.points].sort((a, b) => a.sequence - b.sequence);
    const ring = sorted.map((p) => [p.point[1], p.point[0]] as [number, number]);
    ring.push(ring[0]);
    const regionPoly = turfPolygon([ring]);

    // Both from and to must be inside the region for tricycle to be viable
    const fromInRegion = booleanPointInPolygon(turfPoint([from[1], from[0]]), regionPoly);
    const toInRegion = booleanPointInPolygon(turfPoint([to[1], to[0]]), regionPoly);
    if (!fromInRegion || !toInRegion) continue;

    for (const station of region.stations) {
      // Station must be in its region
      const stationInRegion = booleanPointInPolygon(
        turfPoint([station.point[1], station.point[0]]),
        regionPoly,
      );
      if (!stationInRegion) continue;

      const walkDist = haversineMeters(from, station.point);
      const rideDist = haversineMeters(station.point, to);

      // Business rule: discard if walk to station > ride distance
      if (walkDist > rideDist) continue;

      const totalCost = walkDist + rideDist;

      if (!bestOption || totalCost < bestOption.totalCost) {
        bestOption = {
          stationName: station.address,
          stationPoint: station.point,
          walkToStationDistance: walkDist,
          rideDistance: rideDist,
          totalCost,
        };
      }
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Bbox helper
// ---------------------------------------------------------------------------

function computeBbox(
  geoJsonCoords: Array<[number, number]>,
): [number, number, number, number] {
  if (geoJsonCoords.length < 2) {
    const [lng, lat] = geoJsonCoords[0] ?? [0, 0];
    return [lng, lat, lng, lat];
  }

  const line = turfLineString(geoJsonCoords);
  const bb = turfBbox(line);
  return [bb[0], bb[1], bb[2], bb[3]];
}
