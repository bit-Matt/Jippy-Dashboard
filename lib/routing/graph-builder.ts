// ---------------------------------------------------------------------------
// Dynamic graph construction from transit data
// ---------------------------------------------------------------------------

import turfDistance from "@turf/distance";
import { point as turfPoint, lineString as turfLineString, polygon as turfPolygon } from "@turf/helpers";
import turfLineIntersect from "@turf/line-intersect";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

import { unwrap } from "@/lib/one-of";
import * as routeManager from "@/lib/management/route-manager";
import * as regionManager from "@/lib/management/region-manager";
import * as closureManager from "@/lib/management/closure-manager";

import { GridIndex } from "@/lib/routing/spatial-index";
import {
  CLOSURE_PENALTY_MULTIPLIER,
  MAX_TRANSIT_PROXIMITY_METERS,
  TRANSFER_PENALTY_METERS,
  TRANSFER_PROXIMITY_METERS,
  TRANSIT_COST_FACTOR,
  VIRTUAL_END_ID,
  VIRTUAL_START_ID,
  WALK_COMFORT_METERS,
  WALK_ESCALATION_RATE,
  WALK_PENALTY_MULTIPLIER,
} from "@/lib/routing/constants";
import type {
  GraphEdge,
  GraphNode,
  LatLng,
  TransitClosure,
  TransitData,
  TransitRegion,
  TransitRoute,
} from "@/lib/routing/types";

// Re-export decodePolyline/encodePolyline utilities
export { decodePolyline, encodePolyline } from "./polyline";

// ---------------------------------------------------------------------------
// 1. Load transit data from database
// ---------------------------------------------------------------------------

export async function loadTransitData(): Promise<TransitData> {
  const { decodePolyline } = await import("./polyline");

  const [allRoutes, allRegions, allClosures] = await Promise.all([
    unwrap(routeManager.getAllRoutes(true)),
    unwrap(regionManager.getAllRegions(true)),
    unwrap(closureManager.getAllClosures(true)),
  ]);

  const routes: TransitRoute[] = allRoutes.map((r) => ({
    id: r.id,
    routeNumber: r.routeNumber,
    routeName: r.routeName,
    routeColor: r.routeColor,
    polylines: r.polylines,
    decodedGoingTo: r.polylines.to ? decodePolyline(r.polylines.to) : [],
    decodedGoingBack: r.polylines.back ? decodePolyline(r.polylines.back) : [],
  }));

  const regions: TransitRegion[] = (allRegions as regionManager.RegionBaseObject[]).map((r) => ({
    id: r.id,
    regionName: r.regionName,
    regionColor: r.regionColor,
    regionShape: r.regionShape,
    points: r.points,
    stations: r.stations,
  }));

  const closures: TransitClosure[] = (allClosures as closureManager.ClosureObject[]).map((c) => ({
    id: c.id,
    closureName: c.closureName,
    points: c.points,
  }));

  return { routes, regions, closures };
}

// ---------------------------------------------------------------------------
// 2. Build graph nodes from decoded polylines
// ---------------------------------------------------------------------------

export function buildGraphNodes(routes: TransitRoute[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();

  for (const route of routes) {
    addDirectionNodes(nodes, route, "goingTo", route.decodedGoingTo);
    addDirectionNodes(nodes, route, "goingBack", route.decodedGoingBack);
  }

  return nodes;
}

function addDirectionNodes(
  nodes: Map<string, GraphNode>,
  route: TransitRoute,
  direction: "goingTo" | "goingBack",
  coords: LatLng[],
): void {
  if (coords.length < 2) return;

  for (let i = 0; i < coords.length; i++) {
    const id = `${route.id}:${direction}:${i}`;
    nodes.set(id, {
      id,
      lat: coords[i][0],
      lng: coords[i][1],
      routeId: route.id,
      routeName: route.routeName,
      routeColor: route.routeColor,
      direction,
      polylineIndex: i,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. Build transit (ride) edges along polylines
// ---------------------------------------------------------------------------

export function buildTransitEdges(
  routes: TransitRoute[],
  nodes: Map<string, GraphNode>,
): Map<string, GraphEdge[]> {
  const adjacency = new Map<string, GraphEdge[]>();

  for (const route of routes) {
    addDirectionEdges(adjacency, route, "goingTo", route.decodedGoingTo);
    addDirectionEdges(adjacency, route, "goingBack", route.decodedGoingBack);
  }

  // Initialise empty adjacency lists for nodes with no outgoing edges
  for (const nodeId of nodes.keys()) {
    if (!adjacency.has(nodeId)) {
      adjacency.set(nodeId, []);
    }
  }

  return adjacency;
}

function addDirectionEdges(
  adjacency: Map<string, GraphEdge[]>,
  route: TransitRoute,
  direction: "goingTo" | "goingBack",
  coords: LatLng[],
): void {
  if (coords.length < 2) return;

  for (let i = 0; i < coords.length - 1; i++) {
    const fromId = `${route.id}:${direction}:${i}`;
    const toId = `${route.id}:${direction}:${i + 1}`;
    const dist = haversineMeters(coords[i], coords[i + 1]);

    let edges = adjacency.get(fromId);
    if (!edges) {
      edges = [];
      adjacency.set(fromId, edges);
    }

    edges.push({
      from: fromId,
      to: toId,
      distance: dist,
      cost: dist * TRANSIT_COST_FACTOR,
      type: "transit",
      routeId: route.id,
      routeName: route.routeName,
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Build transfer edges between nearby nodes of different routes
// ---------------------------------------------------------------------------

export function buildTransferEdges(
  nodes: Map<string, GraphNode>,
  adjacency: Map<string, GraphEdge[]>,
): void {
  const index = new GridIndex(TRANSFER_PROXIMITY_METERS);

  for (const [nodeId, node] of nodes) {
    index.insert(nodeId, node.lat, node.lng);
  }

  // For each node, find nearby nodes on different routes/directions.
  // To avoid an explosion of edges when routes run parallel, we keep
  // only the CLOSEST transfer target per (otherRouteId, otherDirection).
  for (const [nodeId, node] of nodes) {
    const nearby = index.queryNearby(node.lat, node.lng, TRANSFER_PROXIMITY_METERS);

    // Collect best candidate per route+direction
    const bestPerRoute = new Map<string, { otherId: string; dist: number }>();

    for (const otherId of nearby) {
      if (otherId === nodeId) continue;

      const other = nodes.get(otherId)!;
      if (node.routeId === other.routeId && node.direction === other.direction) continue;

      const dist = haversineMeters([node.lat, node.lng], [other.lat, other.lng]);
      if (dist > TRANSFER_PROXIMITY_METERS) continue;

      const key = `${other.routeId}:${other.direction}`;
      const existing = bestPerRoute.get(key);
      if (!existing || dist < existing.dist) {
        bestPerRoute.set(key, { otherId, dist });
      }
    }

    // Create transfer edges only to the closest node per other route+direction
    for (const [, { otherId, dist }] of bestPerRoute) {
      const other = nodes.get(otherId)!;
      const walkCost = dist * WALK_PENALTY_MULTIPLIER;
      const totalCost = walkCost + TRANSFER_PENALTY_METERS;

      addEdgeIfAbsent(adjacency, {
        from: nodeId,
        to: otherId,
        distance: dist,
        cost: totalCost,
        type: "transfer",
        routeId: other.routeId,
        routeName: other.routeName,
      });
    }
  }
}

function addEdgeIfAbsent(adjacency: Map<string, GraphEdge[]>, edge: GraphEdge): void {
  let edges = adjacency.get(edge.from);
  if (!edges) {
    edges = [];
    adjacency.set(edge.from, edges);
  }
  // Check if an edge to the same target already exists
  if (!edges.some((e) => e.to === edge.to)) {
    edges.push(edge);
  }
}

// ---------------------------------------------------------------------------
// 5. Apply closure penalties to transit edges
// ---------------------------------------------------------------------------

export function applyClosurePenalties(
  adjacency: Map<string, GraphEdge[]>,
  nodes: Map<string, GraphNode>,
  closures: TransitClosure[],
): void {
  if (closures.length === 0) return;

  // Build GeoJSON polygons for each closure
  const closurePolygons = closures
    .filter((c) => c.points.length >= 3)
    .map((c) => {
      const sorted = [...c.points].sort((a, b) => a.sequence - b.sequence);
      // Ring must be closed: [lng, lat] for GeoJSON
      const ring = sorted.map((p) => [p.point[1], p.point[0]] as [number, number]);
      ring.push(ring[0]);
      return turfPolygon([ring]);
    });

  if (closurePolygons.length === 0) return;

  for (const [, edges] of adjacency) {
    for (const edge of edges) {
      if (edge.type !== "transit") continue;

      const fromNode = nodes.get(edge.from);
      const toNode = nodes.get(edge.to);
      if (!fromNode || !toNode) continue;

      // Check if the edge segment intersects any closure polygon
      const segment = turfLineString([
        [fromNode.lng, fromNode.lat],
        [toNode.lng, toNode.lat],
      ]);

      for (const closurePoly of closurePolygons) {
        const intersections = turfLineIntersect(segment, closurePoly);
        if (intersections.features.length > 0) {
          edge.cost *= CLOSURE_PENALTY_MULTIPLIER;
          break; // One penalty per edge is enough
        }

        // Also check if the edge midpoint is inside the closure
        const midLat = (fromNode.lat + toNode.lat) / 2;
        const midLng = (fromNode.lng + toNode.lng) / 2;
        if (booleanPointInPolygon(turfPoint([midLng, midLat]), closurePoly)) {
          edge.cost *= CLOSURE_PENALTY_MULTIPLIER;
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Inject virtual start/end nodes with walk edges to nearby polyline nodes
// ---------------------------------------------------------------------------

/** Max candidates per route+direction to query GraphHopper for real walk distance */
const ACCESS_CANDIDATES_PER_DIRECTION = 16;
/** Global cap on total GraphHopper queries for access edges */
const MAX_ACCESS_QUERIES = 30;
/** Max candidates per route+direction for egress GraphHopper queries */
const EGRESS_CANDIDATES_PER_DIRECTION = 16;
/** Global cap on total GraphHopper queries for egress edges */
const MAX_EGRESS_QUERIES = 30;

export async function injectUserNodes(
  start: LatLng,
  end: LatLng,
  routes: TransitRoute[],
  nodes: Map<string, GraphNode>,
  adjacency: Map<string, GraphEdge[]>,
): Promise<{ hasAccessEdges: boolean; hasEgressEdges: boolean }> {
  // Create virtual nodes
  nodes.set(VIRTUAL_START_ID, {
    id: VIRTUAL_START_ID,
    lat: start[0],
    lng: start[1],
    routeId: "__virtual__",
    routeName: "",
    routeColor: "",
    direction: "goingTo",
    polylineIndex: -1,
  });

  nodes.set(VIRTUAL_END_ID, {
    id: VIRTUAL_END_ID,
    lat: end[0],
    lng: end[1],
    routeId: "__virtual__",
    routeName: "",
    routeColor: "",
    direction: "goingTo",
    polylineIndex: -1,
  });

  adjacency.set(VIRTUAL_START_ID, []);
  adjacency.set(VIRTUAL_END_ID, []);

  // Direction vector from A → B for directional filtering
  const abLat = end[0] - start[0];
  const abLng = end[1] - start[1];

  let hasAccessEdges = false;
  let hasEgressEdges = false;

  // --- ACCESS: Collect candidates, query GraphHopper for real walk distances ---
  // The algorithm can't know actual walking distance from geometric distance
  // alone (roads may not follow straight lines). We select the top-N nearest
  // candidates per route+direction by geometric distance, then query
  // GraphHopper in parallel to get real road-network walking distances.
  const accessDegThreshold = MAX_TRANSIT_PROXIMITY_METERS / 111_320;

  const candidatesByGroup = new Map<string, { nodeId: string; geoDist: number }[]>();

  for (const [nodeId, node] of nodes) {
    if (node.routeId === "__virtual__") continue;

    // Fast degree-based pre-filter
    if (Math.abs(node.lat - start[0]) > accessDegThreshold) continue;
    if (Math.abs(node.lng - start[1]) > accessDegThreshold * 1.5) continue;

    const dist = haversineMeters([node.lat, node.lng], start);
    if (dist > MAX_TRANSIT_PROXIMITY_METERS) continue;

    // Find the decoded polyline for this node's route+direction
    const route = routes.find((r) => r.id === node.routeId);
    if (!route) continue;

    const coords = node.direction === "goingTo" ? route.decodedGoingTo : route.decodedGoingBack;
    if (coords.length < 2) continue;

    // Directional filter: route from boarding point should generally head toward B
    const routeDir = getRouteDirection(coords, node.polylineIndex);
    const dotProduct = routeDir[0] * abLat + routeDir[1] * abLng;
    if (dotProduct <= 0) continue;

    const groupKey = `${node.routeId}:${node.direction}`;
    let group = candidatesByGroup.get(groupKey);
    if (!group) {
      group = [];
      candidatesByGroup.set(groupKey, group);
    }
    group.push({ nodeId, geoDist: dist });
  }

  // Keep top-N per group, then cap globally
  const accessCandidates: { nodeId: string; geoDist: number }[] = [];
  for (const [, group] of candidatesByGroup) {
    group.sort((a, b) => a.geoDist - b.geoDist);
    accessCandidates.push(...group.slice(0, ACCESS_CANDIDATES_PER_DIRECTION));
  }
  accessCandidates.sort((a, b) => a.geoDist - b.geoDist);
  const cappedCandidates = accessCandidates.slice(0, MAX_ACCESS_QUERIES);

  // Query GraphHopper in parallel for real walking distances
  const { getWalkDistance } = await import("@/lib/routing/graphhopper-walk");
  const walkResults = await Promise.all(
    cappedCandidates.map(async (candidate) => {
      const node = nodes.get(candidate.nodeId)!;
      try {
        const realDist = await getWalkDistance(start, [node.lat, node.lng]);
        return { nodeId: candidate.nodeId, realDist };
      } catch {
        // Fall back to geometric estimate with typical detour factor
        return { nodeId: candidate.nodeId, realDist: candidate.geoDist * 1.4 };
      }
    }),
  );

  // Create access edges with real walking distances
  for (const { nodeId, realDist } of walkResults) {
    if (!isFinite(realDist)) continue;
    const node = nodes.get(nodeId)!;
    const walkCost = progressiveWalkCost(realDist);
    adjacency.get(VIRTUAL_START_ID)!.push({
      from: VIRTUAL_START_ID,
      to: nodeId,
      distance: realDist,
      cost: walkCost,
      type: "walk",
      routeId: node.routeId,
      routeName: node.routeName,
    });
    hasAccessEdges = true;
  }

  // --- EGRESS: Collect candidates, query GraphHopper for real walk distances ---
  // Same approach as access: select top-N nearest candidates per route+direction
  // by geometric distance, then query GraphHopper in parallel for real distances.
  const egressDegThreshold = MAX_TRANSIT_PROXIMITY_METERS / 111_320;

  const egressByGroup = new Map<string, { nodeId: string; geoDist: number }[]>();

  for (const [nodeId, node] of nodes) {
    if (node.routeId === "__virtual__") continue;

    // Fast degree-based pre-filter to skip distant nodes cheaply
    if (Math.abs(node.lat - end[0]) > egressDegThreshold) continue;
    if (Math.abs(node.lng - end[1]) > egressDegThreshold * 1.5) continue;

    const dist = haversineMeters([node.lat, node.lng], end);
    if (dist > MAX_TRANSIT_PROXIMITY_METERS) continue;

    const groupKey = `${node.routeId}:${node.direction}`;
    let group = egressByGroup.get(groupKey);
    if (!group) {
      group = [];
      egressByGroup.set(groupKey, group);
    }
    group.push({ nodeId, geoDist: dist });
  }

  // Keep top-N per group, then cap globally
  const egressCandidates: { nodeId: string; geoDist: number }[] = [];
  for (const [, group] of egressByGroup) {
    group.sort((a, b) => a.geoDist - b.geoDist);
    egressCandidates.push(...group.slice(0, EGRESS_CANDIDATES_PER_DIRECTION));
  }
  egressCandidates.sort((a, b) => a.geoDist - b.geoDist);
  const cappedEgress = egressCandidates.slice(0, MAX_EGRESS_QUERIES);

  // Query GraphHopper in parallel for real walking distances
  const egressResults = await Promise.all(
    cappedEgress.map(async (candidate) => {
      const node = nodes.get(candidate.nodeId)!;
      try {
        const realDist = await getWalkDistance([node.lat, node.lng], end);
        return { nodeId: candidate.nodeId, realDist };
      } catch {
        return { nodeId: candidate.nodeId, realDist: candidate.geoDist * 1.4 };
      }
    }),
  );

  // Create egress edges with real walking distances
  for (const { nodeId, realDist } of egressResults) {
    if (!isFinite(realDist)) continue;
    const walkCost = progressiveWalkCost(realDist);

    let nodeEdges = adjacency.get(nodeId);
    if (!nodeEdges) {
      nodeEdges = [];
      adjacency.set(nodeId, nodeEdges);
    }
    nodeEdges.push({
      from: nodeId,
      to: VIRTUAL_END_ID,
      distance: realDist,
      cost: walkCost,
      type: "walk",
    });
    hasEgressEdges = true;
  }

  return { hasAccessEdges, hasEgressEdges };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function haversineMeters(a: LatLng, b: LatLng): number {
  return turfDistance(turfPoint([a[1], a[0]]), turfPoint([b[1], b[0]]), { units: "meters" });
}

/**
 * Computes a progressive walk cost: linear up to WALK_COMFORT_METERS,
 * then quadratically escalating beyond that. This strongly discourages
 * the algorithm from choosing long walks over transit + transfer.
 */
export function progressiveWalkCost(distMeters: number): number {
  if (distMeters <= WALK_COMFORT_METERS) {
    return distMeters * WALK_PENALTY_MULTIPLIER;
  }
  const baseCost = WALK_COMFORT_METERS * WALK_PENALTY_MULTIPLIER;
  const excess = distMeters - WALK_COMFORT_METERS;
  return baseCost + excess * WALK_PENALTY_MULTIPLIER * (1 + excess * WALK_ESCALATION_RATE);
}

function getRouteDirection(coords: LatLng[], fromIdx: number): [number, number] {
  const lookahead = Math.min(fromIdx + 5, coords.length - 1);
  if (lookahead === fromIdx) return [0, 0];
  return [
    coords[lookahead][0] - coords[fromIdx][0],
    coords[lookahead][1] - coords[fromIdx][1],
  ];
}
