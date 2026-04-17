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
  MAX_TRANSIT_PROXIMITY_METERS,
  TRANSFER_PROXIMITY_METERS,
  VIRTUAL_END_ID,
  VIRTUAL_START_ID,
} from "@/lib/routing/constants";
import type {
  GraphEdge,
  GraphNode,
  LatLng,
  TransitClosure,
  TransitData,
  TransitRegion,
  TransitRoute,
  WeightProfile,
} from "@/lib/routing/types";

// Re-export decodePolyline/encodePolyline utilities
export { decodePolyline, encodePolyline } from "./polyline";

// ---------------------------------------------------------------------------
// Base-graph types — topology + raw distances, shared across profiles
// ---------------------------------------------------------------------------

export interface BaseEdge {
  from: string;
  to: string;
  distance: number;
  type: "transit" | "transfer" | "walk";
  routeId?: string;
  routeName?: string;
  /** For transfer edges: the walking distance between the two nodes */
  transferWalkDist?: number;
  /** True if the edge intersects a road-closure polygon */
  closureAffected?: boolean;
}

export interface BaseGraph {
  nodes: Map<string, GraphNode>;
  /** Raw edges keyed by source node — distances only, no profile costs */
  baseEdges: Map<string, BaseEdge[]>;
  /** Per-route boarding cost (raw, before profile factor) = (roundTrip / fleet) / 2 */
  rawBoardingCosts: Map<string, number>;
  /** Access walk candidates: nodeId → raw walk distance in meters */
  accessWalkDistances: Map<string, number>;
  /** Egress walk candidates: nodeId → raw walk distance in meters */
  egressWalkDistances: Map<string, number>;
  /** Whether any access / egress edges were found */
  hasAccessEdges: boolean;
  hasEgressEdges: boolean;
}

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
    fleetCount: (r as { fleetCount?: number }).fleetCount ?? 100,
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
// 3. Compute per-route RAW boarding cost (before profile factor)
// ---------------------------------------------------------------------------

/**
 * Raw boarding cost = (routeRoundTripDistance / fleetCount) / 2.
 * The profile's boardingCostFactor is applied later during costing.
 */
export function computeRawBoardingCosts(routes: TransitRoute[]): Map<string, number> {
  const costs = new Map<string, number>();

  for (const route of routes) {
    const goingToDist = polylineDistance(route.decodedGoingTo);
    const goingBackDist = polylineDistance(route.decodedGoingBack);
    const roundTripDist = goingToDist + goingBackDist;
    const fleetCount = Math.max(route.fleetCount, 1);

    costs.set(route.id, (roundTripDist / fleetCount) / 2);
  }

  return costs;
}

function polylineDistance(coords: LatLng[]): number {
  let dist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    dist += haversineMeters(coords[i], coords[i + 1]);
  }
  return dist;
}

// ---------------------------------------------------------------------------
// 4. Build transit (ride) base edges along polylines (distance only, no cost)
// ---------------------------------------------------------------------------

export function buildBaseTransitEdges(
  routes: TransitRoute[],
  nodes: Map<string, GraphNode>,
): Map<string, BaseEdge[]> {
  const adjacency = new Map<string, BaseEdge[]>();

  for (const route of routes) {
    addBaseDirectionEdges(adjacency, route, "goingTo", route.decodedGoingTo);
    addBaseDirectionEdges(adjacency, route, "goingBack", route.decodedGoingBack);
  }

  // Initialise empty adjacency lists for nodes with no outgoing edges
  for (const nodeId of nodes.keys()) {
    if (!adjacency.has(nodeId)) {
      adjacency.set(nodeId, []);
    }
  }

  return adjacency;
}

function addBaseDirectionEdges(
  adjacency: Map<string, BaseEdge[]>,
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
      type: "transit",
      routeId: route.id,
      routeName: route.routeName,
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Build transfer edges between nearby nodes of different routes
// ---------------------------------------------------------------------------

export function buildBaseTransferEdges(
  nodes: Map<string, GraphNode>,
  baseEdges: Map<string, BaseEdge[]>,
): void {
  const index = new GridIndex(TRANSFER_PROXIMITY_METERS);

  for (const [nodeId, node] of nodes) {
    index.insert(nodeId, node.lat, node.lng);
  }

  for (const [nodeId, node] of nodes) {
    const nearby = index.queryNearby(node.lat, node.lng, TRANSFER_PROXIMITY_METERS);

    const bestPerRoute = new Map<string, { otherId: string; dist: number }>();

    for (const otherId of nearby) {
      if (otherId === nodeId) continue;

      const other = nodes.get(otherId)!;
      if (node.routeId === other.routeId) continue;

      const dist = haversineMeters([node.lat, node.lng], [other.lat, other.lng]);
      if (dist > TRANSFER_PROXIMITY_METERS) continue;

      const key = `${other.routeId}:${other.direction}`;
      const existing = bestPerRoute.get(key);
      if (!existing || dist < existing.dist) {
        bestPerRoute.set(key, { otherId, dist });
      }
    }

    for (const [, { otherId, dist }] of bestPerRoute) {
      const other = nodes.get(otherId)!;

      addBaseEdgeIfAbsent(baseEdges, {
        from: nodeId,
        to: otherId,
        distance: dist,
        transferWalkDist: dist,
        type: "transfer",
        routeId: other.routeId,
        routeName: other.routeName,
      });
    }
  }
}

function addBaseEdgeIfAbsent(adjacency: Map<string, BaseEdge[]>, edge: BaseEdge): void {
  let edges = adjacency.get(edge.from);
  if (!edges) {
    edges = [];
    adjacency.set(edge.from, edges);
  }
  if (!edges.some((e) => e.to === edge.to)) {
    edges.push(edge);
  }
}

// ---------------------------------------------------------------------------
// 5. Mark closure-affected edges
// ---------------------------------------------------------------------------

export function markClosureEdges(
  baseEdges: Map<string, BaseEdge[]>,
  nodes: Map<string, GraphNode>,
  closures: TransitClosure[],
): void {
  if (closures.length === 0) return;

  const closurePolygons = closures
    .filter((c) => c.points.length >= 3)
    .map((c) => {
      const sorted = [...c.points].sort((a, b) => a.sequence - b.sequence);
      const ring = sorted.map((p) => [p.point[1], p.point[0]] as [number, number]);
      ring.push(ring[0]);
      return turfPolygon([ring]);
    });

  if (closurePolygons.length === 0) return;

  for (const [, edges] of baseEdges) {
    for (const edge of edges) {
      if (edge.type !== "transit") continue;

      const fromNode = nodes.get(edge.from);
      const toNode = nodes.get(edge.to);
      if (!fromNode || !toNode) continue;

      const segment = turfLineString([
        [fromNode.lng, fromNode.lat],
        [toNode.lng, toNode.lat],
      ]);

      for (const closurePoly of closurePolygons) {
        const intersections = turfLineIntersect(segment, closurePoly);
        if (intersections.features.length > 0) {
          edge.closureAffected = true;
          break;
        }

        const midLat = (fromNode.lat + toNode.lat) / 2;
        const midLng = (fromNode.lng + toNode.lng) / 2;
        if (booleanPointInPolygon(turfPoint([midLng, midLat]), closurePoly)) {
          edge.closureAffected = true;
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Query raw walk distances for virtual start/end nodes (GraphHopper I/O)
// ---------------------------------------------------------------------------

const ACCESS_CANDIDATES_PER_DIRECTION = 16;
const MAX_ACCESS_QUERIES = 30;
const EGRESS_CANDIDATES_PER_DIRECTION = 16;
const MAX_EGRESS_QUERIES = 30;

/**
 * Creates virtual start/end nodes, queries GraphHopper for raw walk distances
 * to nearby transit nodes. Returns the raw distances (no cost applied) so
 * each weight profile can reuse them.
 */
export async function queryUserNodeDistances(
  start: LatLng,
  end: LatLng,
  routes: TransitRoute[],
  nodes: Map<string, GraphNode>,
): Promise<{
  accessDistances: Map<string, number>;
  egressDistances: Map<string, number>;
}> {
  // Ensure virtual nodes exist
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

  const abLat = end[0] - start[0];
  const abLng = end[1] - start[1];

  // --- ACCESS candidates ---
  const accessDegThreshold = MAX_TRANSIT_PROXIMITY_METERS / 111_320;
  const candidatesByGroup = new Map<string, { nodeId: string; geoDist: number }[]>();

  for (const [nodeId, node] of nodes) {
    if (node.routeId === "__virtual__") continue;
    if (Math.abs(node.lat - start[0]) > accessDegThreshold) continue;
    if (Math.abs(node.lng - start[1]) > accessDegThreshold * 1.5) continue;

    const dist = haversineMeters([node.lat, node.lng], start);
    if (dist > MAX_TRANSIT_PROXIMITY_METERS) continue;

    const route = routes.find((r) => r.id === node.routeId);
    if (!route) continue;

    const coords = node.direction === "goingTo" ? route.decodedGoingTo : route.decodedGoingBack;
    if (coords.length < 2) continue;

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

  const accessCandidates: { nodeId: string; geoDist: number }[] = [];
  for (const [, group] of candidatesByGroup) {
    group.sort((a, b) => a.geoDist - b.geoDist);
    accessCandidates.push(...group.slice(0, ACCESS_CANDIDATES_PER_DIRECTION));
  }
  accessCandidates.sort((a, b) => a.geoDist - b.geoDist);
  const cappedAccess = accessCandidates.slice(0, MAX_ACCESS_QUERIES);

  const { getWalkDistance } = await import("@/lib/routing/graphhopper-walk");

  const accessResults = await Promise.all(
    cappedAccess.map(async (c) => {
      const node = nodes.get(c.nodeId)!;
      try {
        const d = await getWalkDistance(start, [node.lat, node.lng]);
        return { nodeId: c.nodeId, dist: d };
      } catch {
        return { nodeId: c.nodeId, dist: c.geoDist * 1.4 };
      }
    }),
  );

  const accessDistances = new Map<string, number>();
  for (const { nodeId, dist } of accessResults) {
    if (isFinite(dist)) accessDistances.set(nodeId, dist);
  }

  // --- EGRESS candidates ---
  const egressDegThreshold = MAX_TRANSIT_PROXIMITY_METERS / 111_320;
  const egressByGroup = new Map<string, { nodeId: string; geoDist: number }[]>();

  for (const [nodeId, node] of nodes) {
    if (node.routeId === "__virtual__") continue;
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

  const egressCandidates: { nodeId: string; geoDist: number }[] = [];
  for (const [, group] of egressByGroup) {
    group.sort((a, b) => a.geoDist - b.geoDist);
    egressCandidates.push(...group.slice(0, EGRESS_CANDIDATES_PER_DIRECTION));
  }
  egressCandidates.sort((a, b) => a.geoDist - b.geoDist);
  const cappedEgress = egressCandidates.slice(0, MAX_EGRESS_QUERIES);

  const egressResults = await Promise.all(
    cappedEgress.map(async (c) => {
      const node = nodes.get(c.nodeId)!;
      try {
        const d = await getWalkDistance([node.lat, node.lng], end);
        return { nodeId: c.nodeId, dist: d };
      } catch {
        return { nodeId: c.nodeId, dist: c.geoDist * 1.4 };
      }
    }),
  );

  const egressDistances = new Map<string, number>();
  for (const { nodeId, dist } of egressResults) {
    if (isFinite(dist)) egressDistances.set(nodeId, dist);
  }

  return { accessDistances, egressDistances };
}

// ---------------------------------------------------------------------------
// 7. Build costed adjacency from base graph + weight profile
// ---------------------------------------------------------------------------

/**
 * Applies a WeightProfile to the base graph, producing a `GraphEdge[]` adjacency
 * map suitable for A*. This is cheap (pure math, no I/O) so it can be called
 * per-profile without penalty.
 */
export function buildCostedAdjacency(
  baseEdges: Map<string, BaseEdge[]>,
  rawBoardingCosts: Map<string, number>,
  accessDistances: Map<string, number>,
  egressDistances: Map<string, number>,
  nodes: Map<string, GraphNode>,
  profile: WeightProfile,
): Map<string, GraphEdge[]> {
  const adjacency = new Map<string, GraphEdge[]>();

  // Apply costs to all base edges (transit + transfer)
  for (const [nodeId, edges] of baseEdges) {
    const costed: GraphEdge[] = [];

    for (const base of edges) {
      let cost: number;

      if (base.type === "transit") {
        cost = base.distance * profile.transitCostFactor;

        // Diversity penalty for Explorer route
        if (profile.penalizedRouteIds?.has(base.routeId!)) {
          cost *= profile.diversityPenalty ?? 1;
        }

        // Closure penalty
        if (base.closureAffected) {
          cost *= profile.closurePenaltyMultiplier;
        }
      } else if (base.type === "transfer") {
        const walkCost = (base.transferWalkDist ?? base.distance) * profile.walkPenaltyMultiplier;
        const boardingCost = (rawBoardingCosts.get(base.routeId!) ?? 0) * profile.boardingCostFactor;
        cost = walkCost + profile.transferPenaltyMeters + boardingCost;
      } else {
        // walk edges from base (shouldn't exist in base, but handle gracefully)
        cost = profileWalkCost(base.distance, profile);
      }

      costed.push({
        from: base.from,
        to: base.to,
        distance: base.distance,
        cost,
        type: base.type,
        routeId: base.routeId,
        routeName: base.routeName,
      });
    }

    adjacency.set(nodeId, costed);
  }

  // Add access edges (VIRTUAL_START → transit nodes)
  const accessEdges: GraphEdge[] = [];
  for (const [nodeId, rawDist] of accessDistances) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const walkCost = profileWalkCost(rawDist, profile);
    const boardingCost = (rawBoardingCosts.get(node.routeId) ?? 0) * profile.boardingCostFactor;
    accessEdges.push({
      from: VIRTUAL_START_ID,
      to: nodeId,
      distance: rawDist,
      cost: walkCost + boardingCost,
      type: "walk",
      routeId: node.routeId,
      routeName: node.routeName,
    });
  }
  adjacency.set(VIRTUAL_START_ID, accessEdges);

  // Add egress edges (transit nodes → VIRTUAL_END)
  for (const [nodeId, rawDist] of egressDistances) {
    const walkCost = profileWalkCost(rawDist, profile);
    let nodeEdges = adjacency.get(nodeId);
    if (!nodeEdges) {
      nodeEdges = [];
      adjacency.set(nodeId, nodeEdges);
    }
    nodeEdges.push({
      from: nodeId,
      to: VIRTUAL_END_ID,
      distance: rawDist,
      cost: walkCost,
      type: "walk",
    });
  }

  // Ensure VIRTUAL_END has an entry
  if (!adjacency.has(VIRTUAL_END_ID)) {
    adjacency.set(VIRTUAL_END_ID, []);
  }

  return adjacency;
}

// ---------------------------------------------------------------------------
// 8. Full base-graph builder (single entry point for orchestrator)
// ---------------------------------------------------------------------------

/**
 * Builds the complete base graph: loads DB data, creates nodes, computes raw
 * edges/distances, queries GraphHopper for access/egress. Returned BaseGraph
 * is reused across all weight profiles.
 */
export async function buildBaseGraph(
  start: LatLng,
  end: LatLng,
): Promise<{ baseGraph: BaseGraph; transitData: TransitData } | null> {
  const transitData = await loadTransitData();

  if (transitData.routes.length === 0) return null;

  const nodes = buildGraphNodes(transitData.routes);
  const baseEdges = buildBaseTransitEdges(transitData.routes, nodes);

  // Transfer edges (raw — cost computed per profile)
  buildBaseTransferEdges(nodes, baseEdges);

  // Mark closure-affected transit edges
  markClosureEdges(baseEdges, nodes, transitData.closures);

  // Raw boarding costs (before profile factor)
  const rawBoardingCosts = computeRawBoardingCosts(transitData.routes);

  // Query GraphHopper for real walk distances (expensive I/O — done once)
  const { accessDistances, egressDistances } = await queryUserNodeDistances(
    start, end, transitData.routes, nodes,
  );

  const hasAccessEdges = accessDistances.size > 0;
  const hasEgressEdges = egressDistances.size > 0;

  return {
    baseGraph: {
      nodes,
      baseEdges,
      rawBoardingCosts,
      accessWalkDistances: accessDistances,
      egressWalkDistances: egressDistances,
      hasAccessEdges,
      hasEgressEdges,
    },
    transitData,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function haversineMeters(a: LatLng, b: LatLng): number {
  return turfDistance(turfPoint([a[1], a[0]]), turfPoint([b[1], b[0]]), { units: "meters" });
}

/**
 * Profile-aware progressive walk cost.
 */
export function profileWalkCost(distMeters: number, profile: WeightProfile): number {
  if (distMeters <= profile.walkComfortMeters) {
    return distMeters * profile.walkPenaltyMultiplier;
  }
  const baseCost = profile.walkComfortMeters * profile.walkPenaltyMultiplier;
  const excess = distMeters - profile.walkComfortMeters;
  return baseCost + excess * profile.walkPenaltyMultiplier * (1 + excess * profile.walkEscalationRate);
}

function getRouteDirection(coords: LatLng[], fromIdx: number): [number, number] {
  const lookahead = Math.min(fromIdx + 5, coords.length - 1);
  if (lookahead === fromIdx) return [0, 0];
  return [
    coords[lookahead][0] - coords[fromIdx][0],
    coords[lookahead][1] - coords[fromIdx][1],
  ];
}
