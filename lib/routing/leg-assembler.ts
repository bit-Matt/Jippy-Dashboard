// ---------------------------------------------------------------------------
// Leg assembly: converts A* path segments into structured RouteLeg objects
// ---------------------------------------------------------------------------

import turfBbox from "@turf/bbox";
import { lineString as turfLineString } from "@turf/helpers";

import { encodePolyline, decodePolyline } from "@/lib/routing/polyline";
import { getWalkRoute } from "@/lib/routing/graphhopper-walk";
import { getTricycleRoute } from "@/lib/routing/valhalla-motorcycle";
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
  VIRTUAL_END_ID,
  WALK_SPEED_KMH,
} from "./constants";
import type {
  Graph,
  LatLng,
  PathSegment,
  RouteLeg,
  GraphEdge,
  GraphNode,
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
// Build access leg (from user start to first boarding node) — walk only
// Tricycle decisions are now handled in the graph via A*.
// ---------------------------------------------------------------------------

export async function buildAccessLeg(
  start: LatLng,
  firstBoardingNode: LatLng,
): Promise<RouteLeg[]> {
  const walkDirect = await getWalkRoute(start, firstBoardingNode);

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
// Build egress leg (from last alighting node to user destination) — walk only
// Tricycle decisions are now handled in the graph via A*.
// ---------------------------------------------------------------------------

export async function buildEgressLeg(
  lastAlightNode: LatLng,
  destination: LatLng,
): Promise<RouteLeg[]> {
  const walkDirect = await getWalkRoute(lastAlightNode, destination);

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
// Build a TRICYCLE leg using Valhalla motorcycle routing
// ---------------------------------------------------------------------------

export async function buildTricycleLeg(
  from: LatLng,
  to: LatLng,
  stationName: string,
  isHail: boolean,
): Promise<RouteLeg> {
  let polyline: string;
  let distance: number;
  let duration: number;

  try {
    const route = await getTricycleRoute(from, to);
    polyline = route.polyline;
    distance = route.distance;
    duration = route.duration;
  } catch {
    // Fallback: straight-line with estimated metrics
    polyline = encodePolyline([from, to]);
    distance = haversineMeters(from, to) * 1.2;
    duration = Math.round(distance / (TRICYCLE_SPEED_KMH * 1000 / 3600));
  }

  const instructions = isHail
    ? generateTricycleInstructions(stationName, true)
    : generateTricycleInstructions(stationName, false);

  return {
    type: "TRICYCLE",
    route_name: stationName,
    polyline,
    color: null,
    distance,
    duration,
    instructions,
    bbox: computeBbox([[from[1], from[0]], [to[1], to[0]]]),
  };
}

// ---------------------------------------------------------------------------
// Build a TRICYCLE leg using GraphHopper walking geometry (local roads).
// Used for station → jeepney transfers so the route stays within the region.
// ---------------------------------------------------------------------------

async function buildLocalTricycleLeg(
  from: LatLng,
  to: LatLng,
  stationName: string,
): Promise<RouteLeg> {
  let polyline: string;
  let distance: number;
  const straight = haversineMeters(from, to);

  // Try Valhalla first — for short intra-region rides it usually stays local.
  // Fall back to GraphHopper walking geometry if Valhalla detours too much.
  try {
    const route = await getTricycleRoute(from, to);
    if (route.distance <= straight * 2.0) {
      polyline = route.polyline;
      distance = route.distance;
    } else {
      throw new Error("detour too high");
    }
  } catch {
    try {
      const walk = await getWalkRoute(from, to);
      polyline = walk.polyline;
      distance = walk.distance;
    } catch {
      polyline = encodePolyline([from, to]);
      distance = straight * 1.2;
    }
  }

  // Duration at tricycle speed, not walking speed
  const duration = Math.round(distance / (TRICYCLE_SPEED_KMH * 1000 / 3600));
  const instructions = generateTricycleInstructions(stationName, false);

  return {
    type: "TRICYCLE",
    route_name: stationName,
    polyline,
    color: null,
    distance,
    duration,
    instructions,
    bbox: computeBbox([[from[1], from[0]], [to[1], to[0]]]),
  };
}

// ---------------------------------------------------------------------------
// Path section types for the new edge-aware path analysis
// ---------------------------------------------------------------------------

export type PathSection =
  | { type: "walk"; fromNode: GraphNode; toNode: GraphNode }
  | { type: "tricycle"; fromNode: GraphNode; toNode: GraphNode; edge: GraphEdge }
  | { type: "transit"; routeId: string; routeName: string; routeColor: string; direction: "goingTo" | "goingBack"; nodes: GraphNode[] };

/**
 * Walk through the A* node path edge-by-edge and group into typed sections.
 * Handles walk, transit, tricycle, and transfer edges.
 */
export function analyzeNodePath(
  nodePath: string[],
  graph: Graph,
): PathSection[] {
  if (nodePath.length < 2) return [];

  const sections: PathSection[] = [];
  let i = 0;

  while (i < nodePath.length - 1) {
    const fromId = nodePath[i];
    const toId = nodePath[i + 1];
    const edge = findEdgeBetween(graph, fromId, toId);
    if (!edge) { i++; continue; }

    if (edge.type === "walk") {
      // Walk section: collect consecutive walk edges into one section
      const walkStartId = fromId;
      let walkEndId = toId;
      i++;
      while (i < nodePath.length - 1) {
        const nextEdge = findEdgeBetween(graph, nodePath[i], nodePath[i + 1]);
        if (!nextEdge || nextEdge.type !== "walk") break;
        walkEndId = nodePath[i + 1];
        i++;
      }
      const fromNode = graph.nodes.get(walkStartId);
      const toNode = graph.nodes.get(walkEndId);
      if (fromNode && toNode) {
        sections.push({ type: "walk", fromNode, toNode });
      }
    } else if (edge.type === "tricycle") {
      // Each tricycle edge is its own section
      const fromNode = graph.nodes.get(fromId);
      const toNode = graph.nodes.get(toId);
      if (fromNode && toNode) {
        sections.push({ type: "tricycle", fromNode, toNode, edge });
      }
      i++;
    } else if (edge.type === "transit") {
      // Transit section: consecutive transit edges with same routeId
      const routeId = edge.routeId!;
      const firstNode = graph.nodes.get(fromId)!;
      const transitNodes: GraphNode[] = [firstNode];
      while (i < nodePath.length - 1) {
        const nextEdge = findEdgeBetween(graph, nodePath[i], nodePath[i + 1]);
        if (!nextEdge || nextEdge.type !== "transit" || nextEdge.routeId !== routeId) break;
        transitNodes.push(graph.nodes.get(nodePath[i + 1])!);
        i++;
      }
      sections.push({
        type: "transit",
        routeId,
        routeName: edge.routeName ?? firstNode.routeName,
        routeColor: firstNode.routeColor,
        direction: firstNode.direction,
        nodes: transitNodes,
      });
    } else if (edge.type === "transfer") {
      // Transfer edges are short walks between routes — skip them
      // (the transit sections will be adjacent, and transfer instruction
      // is generated between consecutive transit sections)
      i++;
    } else {
      i++;
    }
  }

  return sections;
}

/**
 * Convert path sections into RouteLeg array.
 * - Walk sections → GraphHopper walking route
 * - Transit sections → polyline from node coordinates
 * - Tricycle sections → Valhalla motorcycle route
 */
export async function buildLegsFromSections(
  sections: PathSection[],
): Promise<RouteLeg[]> {
  const legs: RouteLeg[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    if (section.type === "walk") {
      const from: LatLng = [section.fromNode.lat, section.fromNode.lng];
      const to: LatLng = [section.toNode.lat, section.toNode.lng];
      // Skip zero-distance walks (same node)
      if (haversineMeters(from, to) < 1) continue;

      const walk = await getWalkRoute(from, to);
      legs.push({
        type: "WALK",
        route_name: null,
        polyline: walk.polyline,
        color: null,
        distance: walk.distance,
        duration: walk.duration,
        instructions: generateWalkInstructions(walk.maneuvers),
        bbox: computeBbox([[from[1], from[0]], [to[1], to[0]]]),
      });
    } else if (section.type === "tricycle") {
      const from: LatLng = [section.fromNode.lat, section.fromNode.lng];
      const to: LatLng = [section.toNode.lat, section.toNode.lng];
      const stationName = section.edge.stationName ?? "tricycle station";
      // Determine if hailing: if the from node is a tricycle station, it's a station ride; otherwise hailing
      const fromIsStation = section.fromNode.id.startsWith("tricycle:");
      const actualIsHail = !fromIsStation;

      // Non-hail, station → jeepney node: use GraphHopper walking geometry
      // (local roads) instead of Valhalla (which routes via highways outside
      // the region).  Present as a TRICYCLE leg at tricycle speed.
      if (!actualIsHail && section.toNode.id !== VIRTUAL_END_ID) {
        const straightDist = haversineMeters(from, to);
        if (straightDist < 1) continue; // skip zero-distance
        const leg = await buildLocalTricycleLeg(from, to, stationName);
        legs.push(leg);
        continue;
      }

      // For hail rides: route the tricycle from the station, not the jeepney
      // alight point. Tricycles operate within their region — routing from an
      // arbitrary jeepney node would send Valhalla through roads outside the
      // region. If the station is far enough from the alight point, emit a
      // walk leg to the station first.
      let routeFrom = from;
      if (actualIsHail && section.edge.stationPoint) {
        const stationPt = section.edge.stationPoint;
        const walkToStation = haversineMeters(from, stationPt);
        if (walkToStation > 10) {
          // Emit a walk leg from jeepney alight to the station
          try {
            const walk = await getWalkRoute(from, stationPt);
            legs.push({
              type: "WALK",
              route_name: null,
              polyline: walk.polyline,
              color: null,
              distance: walk.distance,
              duration: walk.duration,
              instructions: generateWalkInstructions(walk.maneuvers),
              bbox: computeBbox([[from[1], from[0]], [stationPt[1], stationPt[0]]]),
            });
          } catch {
            // If walk routing fails, use straight-line estimate
            legs.push({
              type: "WALK",
              route_name: null,
              polyline: encodePolyline([from, stationPt]),
              color: null,
              distance: walkToStation * 1.2,
              duration: Math.round((walkToStation * 1.2) / (WALK_SPEED_KMH * 1000 / 3600)),
              instructions: [{ text: "Walk to tricycle station", maneuver_type: "depart" as const }],
              bbox: computeBbox([[from[1], from[0]], [stationPt[1], stationPt[0]]]),
            });
          }
        }
        routeFrom = stationPt;
      }

      const leg = await buildTricycleLeg(routeFrom, to, stationName, actualIsHail);
      legs.push(leg);
    } else if (section.type === "transit") {
      if (section.nodes.length < 2) continue;

      const coords: Array<[number, number]> = section.nodes.map((n) => [n.lat, n.lng]);
      const polyline = encodePolyline(coords);

      let distance = 0;
      for (let j = 0; j < coords.length - 1; j++) {
        distance += haversineMeters(coords[j], coords[j + 1]);
      }

      const duration = Math.round(distance / (JEEPNEY_SPEED_KMH * 1000 / 3600));

      const segment: PathSegment = {
        routeId: section.routeId,
        direction: section.direction,
        routeName: section.routeName,
        routeColor: section.routeColor,
        nodes: section.nodes,
      };
      const instructions = await generateJeepneyInstructions(segment, distance);

      // Add transfer instruction if next section is also transit (different route)
      if (i < sections.length - 1) {
        const nextSection = sections[i + 1];
        if (nextSection.type === "transit" && nextSection.routeId !== section.routeId) {
          instructions.push(generateTransferInstruction(section.routeName, nextSection.routeName));
        }
      }

      const geoJsonCoords = coords.map(([lat, lng]) => [lng, lat] as [number, number]);
      const bbox = computeBbox(geoJsonCoords);

      legs.push({
        type: "JEEPNEY",
        route_name: section.routeName,
        polyline,
        color: section.routeColor,
        distance,
        duration,
        instructions,
        bbox,
      });
    }
  }

  return fillLegGaps(legs);
}

// ---------------------------------------------------------------------------
// Gap filler — bridges disconnects between consecutive legs
// ---------------------------------------------------------------------------

/**
 * After leg assembly, detect cases where the end of one leg does not connect
 * to the start of the next (GraphHopper road-snapping causes this). When a
 * gap is found, a bridging WALK is inserted via GraphHopper. If the following
 * leg is already a WALK, the two walks are merged to avoid WALK→WALK.
 */
async function fillLegGaps(legs: RouteLeg[]): Promise<RouteLeg[]> {
  const GAP_THRESHOLD_METERS = 10;
  const result: RouteLeg[] = [];

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];

    if (i === 0) {
      result.push(leg);
      continue;
    }

    const prevLeg = result[result.length - 1];
    const prevCoords = decodePolyline(prevLeg.polyline);
    const currCoords = decodePolyline(leg.polyline);

    if (prevCoords.length === 0 || currCoords.length === 0) {
      result.push(leg);
      continue;
    }

    const prevEnd = prevCoords[prevCoords.length - 1];
    const currStart = currCoords[0];
    const gap = haversineMeters(prevEnd, currStart);

    if (gap <= GAP_THRESHOLD_METERS) {
      result.push(leg);
      continue;
    }

    // Build the bridging walk from the end of the previous leg to the
    // start of the current leg.
    let glueCoords: Array<[number, number]>;
    let glueDistance: number;
    let glueDuration: number;
    let glueInstructions: RouteLeg["instructions"];

    try {
      const walk = await getWalkRoute(prevEnd, currStart);
      glueCoords = decodePolyline(walk.polyline);
      glueDistance = walk.distance;
      glueDuration = walk.duration;
      glueInstructions = generateWalkInstructions(walk.maneuvers);
    } catch {
      // Straight-line fallback
      glueCoords = [prevEnd, currStart];
      glueDistance = gap * 1.2;
      glueDuration = Math.round((gap * 1.2) / (WALK_SPEED_KMH * 1000 / 3600));
      glueInstructions = [
        { text: "Walk to continue", maneuver_type: "depart" as const },
        { text: "Arrive at destination", maneuver_type: "arrive" as const },
      ];
    }

    if (leg.type === "WALK") {
      // Merge the glue walk with the existing walk leg to avoid WALK→WALK.
      // If the glue ends very close to where the walk starts, skip the
      // duplicate point when concatenating.
      const lastGlue = glueCoords[glueCoords.length - 1];
      const startSlice = haversineMeters(lastGlue, currCoords[0]) < 5 ? 1 : 0;
      const mergedCoords = [...glueCoords, ...currCoords.slice(startSlice)];

      // Drop the "arrive" instruction from the glue before prepending,
      // since the merged leg still continues to the real destination.
      const filteredGlue = glueInstructions.filter(
        (ins) => ins.maneuver_type !== "arrive",
      );

      const glueBbox = computeBbox(
        glueCoords.map(([lat, lng]) => [lng, lat] as [number, number]),
      );

      result.push({
        type: "WALK",
        route_name: null,
        polyline: encodePolyline(mergedCoords),
        color: null,
        distance: glueDistance + leg.distance,
        duration: glueDuration + leg.duration,
        instructions: [...filteredGlue, ...leg.instructions],
        bbox: mergeBbox(glueBbox, leg.bbox),
      });
    } else {
      // Insert a separate WALK leg before the current leg.
      const glueBbox = computeBbox(
        glueCoords.map(([lat, lng]) => [lng, lat] as [number, number]),
      );
      result.push({
        type: "WALK",
        route_name: null,
        polyline: encodePolyline(glueCoords),
        color: null,
        distance: glueDistance,
        duration: glueDuration,
        instructions: glueInstructions,
        bbox: glueBbox,
      });
      result.push(leg);
    }
  }

  return result;
}

function mergeBbox(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function findEdgeBetween(graph: Graph, fromId: string, toId: string): GraphEdge | null {
  const edges = graph.edges.get(fromId);
  if (!edges) return null;
  return edges.find((e) => e.to === toId) ?? null;
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
