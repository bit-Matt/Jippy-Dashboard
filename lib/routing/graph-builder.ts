// ---------------------------------------------------------------------------
// Dynamic graph construction from transit data
// ---------------------------------------------------------------------------

import turfDistance from "@turf/distance";
import { point as turfPoint, lineString as turfLineString, polygon as turfPolygon } from "@turf/helpers";
import turfLineIntersect from "@turf/line-intersect";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import nearestPointOnLine from "@turf/nearest-point-on-line";

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
  MAX_TRICYCLE_STATION_WALK_METERS,
  STATION_UNAVAILABILITY_THRESHOLD,
  MAX_REGION_BOUNDARY_METERS,
  TRICYCLE_DETOUR_FACTOR,
  TRICYCLE_RIDE_COST_FACTOR,
  STATION_WAIT_PENALTY_METERS,
  HAILING_WAIT_PENALTY_METERS,
  BACKTRACK_PENALTY_MULTIPLIER,
  MAX_TRICYCLE_RIDE_TO_TRANSIT_METERS,
  MAX_BOUNDARY_EXIT_WALK_METERS,
  WALK_DETOUR_FACTOR,
  MAX_DIRECT_WALK_INSTEAD_OF_HAIL_METERS,
} from "@/lib/routing/constants";
import type {
  GraphEdge,
  GraphNode,
  LatLng,
  TransitClosure,
  TransitData,
  TransitRegion,
  TransitRoute,
  TransitStation,
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
  type: "transit" | "transfer" | "walk" | "tricycle";
  routeId?: string;
  routeName?: string;
  /** For transfer edges: the walking distance between the two nodes */
  transferWalkDist?: number;
  /** True if the edge intersects a road-closure polygon */
  closureAffected?: boolean;
  /** Tricycle station ID (for tricycle edges) */
  stationId?: string;
  /** Tricycle station display name */
  stationName?: string;
  /** Tricycle station coordinates [lat, lng] */
  stationPoint?: LatLng;
  /** Region ID for tricycle edges */
  regionId?: string;
  /** True if this tricycle edge uses hailing (higher wait penalty) */
  isHail?: boolean;
  /** For hail edges: walk distance from alight point to station (costed at walk rate, not tricycle rate) */
  walkToStationDist?: number;
  /** Walk detour ratio for walk-to-station backtracking penalty */
  detourRatio?: number;
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
// 5b. Tricycle graph construction — station nodes, ride/walk/hail edges
// ---------------------------------------------------------------------------

/**
 * Check if a station is currently available based on its time window.
 */
function isStationAvailable(station: TransitStation, now: Date): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [fromH, fromM] = station.availableFrom.split(":").map(Number);
  const [toH, toM] = station.availableTo.split(":").map(Number);
  const fromMin = fromH * 60 + fromM;
  const toMin = toH * 60 + toM;

  if (fromMin <= toMin) {
    return currentMinutes >= fromMin && currentMinutes <= toMin;
  }
  // Crosses midnight
  return currentMinutes >= fromMin || currentMinutes <= toMin;
}

/**
 * Returns available stations for a region, or empty array if the region
 * doesn't meet the availability threshold.
 */
function getAvailableStations(region: TransitRegion, now: Date): TransitStation[] {
  if (region.stations.length === 0) return [];
  const available = region.stations.filter((s) => isStationAvailable(s, now));
  const unavailableRatio = 1 - available.length / region.stations.length;
  if (unavailableRatio >= STATION_UNAVAILABILITY_THRESHOLD) return [];
  return available;
}

/**
 * Build a turf polygon from region boundary points.
 */
function buildRegionPolygon(region: TransitRegion) {
  const sorted = [...region.points].sort((a, b) => a.sequence - b.sequence);
  const ring = sorted.map((p) => [p.point[1], p.point[0]] as [number, number]);
  ring.push(ring[0]); // close ring
  return turfPolygon([ring]);
}

/**
 * Find the nearest point on the polygon boundary to a given point.
 * Returns [lat, lng] of the boundary point.
 */
function nearestBoundaryPoint(
  target: LatLng,
  region: TransitRegion,
): LatLng {
  const sorted = [...region.points].sort((a, b) => a.sequence - b.sequence);
  const ring = sorted.map((p) => [p.point[1], p.point[0]] as [number, number]);
  ring.push(ring[0]);
  const boundaryLine = turfLineString(ring);
  const pt = turfPoint([target[1], target[0]]);
  const nearest = nearestPointOnLine(boundaryLine, pt);
  const [lng, lat] = nearest.geometry.coordinates;
  return [lat, lng];
}

/**
 * Build tricycle station nodes and all tricycle-related edges.
 *
 * This creates:
 *  - Station graph nodes
 *  - Boundary drop-off nodes (for near-boundary destinations)
 *  - Tricycle ride edges (station → jeepney nodes in region)
 *  - Walk-to-station edges (jeepney nodes → station, with backtrack penalty)
 *  - Hail edges (jeepney nodes/start → via tricycle with hailing wait)
 *  - Access edges (VIRTUAL_START → station, if start in region)
 *  - Egress edges (station → VIRTUAL_END, if end in region or near boundary)
 */
export function buildTricycleNodesAndEdges(
  regions: TransitRegion[],
  nodes: Map<string, GraphNode>,
  baseEdges: Map<string, BaseEdge[]>,
  start: LatLng,
  end: LatLng,
  now: Date,
): void {
  for (const region of regions) {
    if (region.points.length < 3) continue;

    const availableStations = getAvailableStations(region, now);
    if (availableStations.length === 0) continue;

    const regionPoly = buildRegionPolygon(region);
    const startInRegion = booleanPointInPolygon(turfPoint([start[1], start[0]]), regionPoly);
    const endInRegion = booleanPointInPolygon(turfPoint([end[1], end[0]]), regionPoly);

    // Check if destination is near the region boundary (but outside it)
    let boundaryDropoff: LatLng | null = null;
    let boundaryDropoffId: string | null = null;
    if (!endInRegion) {
      const nearestBp = nearestBoundaryPoint(end, region);
      const distToBoundary = haversineMeters(end, nearestBp);
      if (distToBoundary <= MAX_REGION_BOUNDARY_METERS) {
        boundaryDropoff = nearestBp;
        boundaryDropoffId = `tricycle_dropoff:${region.id}`;
        nodes.set(boundaryDropoffId, {
          id: boundaryDropoffId,
          lat: nearestBp[0],
          lng: nearestBp[1],
          routeId: `__tricycle_region__:${region.id}`,
          routeName: region.regionName,
          routeColor: region.regionColor,
          direction: "goingTo",
          polylineIndex: -1,
        });
        baseEdges.set(boundaryDropoffId, []);
      }
    }

    // Collect jeepney nodes inside the region polygon (for hail edges)
    const jeepneyNodesInRegion = new Set<string>();
    for (const [nodeId, node] of nodes) {
      if (node.routeId === "__virtual__") continue;
      if (node.routeId.startsWith("__tricycle_region__:")) continue;
      if (booleanPointInPolygon(turfPoint([node.lng, node.lat]), regionPoly)) {
        jeepneyNodesInRegion.add(nodeId);
      }
    }

    // Track boundary exit nodes for this region (dedup within 100 m)
    const boundaryExitNodes = new Map<string, LatLng>();

    // --- Create station nodes & edges ---
    for (const station of availableStations) {
      const stationNodeId = `tricycle:${station.id}`;

      nodes.set(stationNodeId, {
        id: stationNodeId,
        lat: station.point[0],
        lng: station.point[1],
        routeId: `__tricycle_region__:${region.id}`,
        routeName: station.address,
        routeColor: region.regionColor,
        direction: "goingTo",
        polylineIndex: -1,
      });

      const stationEdges: BaseEdge[] = [];

      // Find jeepney nodes near THIS station (proximity-based, not polygon-gated)
      // This ensures connectivity even when routes run along the polygon edge.
      const nearbyJeepNodes: string[] = [];
      for (const [nodeId, node] of nodes) {
        if (node.routeId === "__virtual__") continue;
        if (node.routeId.startsWith("__tricycle_region__:")) continue;
        const dist = haversineMeters(station.point, [node.lat, node.lng]);
        if (dist <= MAX_TRICYCLE_STATION_WALK_METERS) {
          nearbyJeepNodes.push(nodeId);
          // Also mark as "in region" for hail eligibility
          jeepneyNodesInRegion.add(nodeId);
        }
      }

      // --- Station → nearby jeepney nodes ---
      // Jeepney routes run OUTSIDE the region.  Direct station→jeepney
      // tricycle edges would exit the region, so for outside-region
      // nodes we route through boundary exit nodes:
      //   station → boundary (tricycle, inside) → jeepney (walk, short)
      const addedStationToExit = new Set<string>();

      for (const jeepNodeId of nearbyJeepNodes) {
        const jeepNode = nodes.get(jeepNodeId)!;
        const jeepPoint: LatLng = [jeepNode.lat, jeepNode.lng];
        const jeepInsideRegion = booleanPointInPolygon(
          turfPoint([jeepNode.lng, jeepNode.lat]),
          regionPoly,
        );

        if (jeepInsideRegion) {
          // Rare: jeepney node inside region — direct tricycle OK
          const straightDist = haversineMeters(station.point, jeepPoint);
          if (straightDist > MAX_TRICYCLE_RIDE_TO_TRANSIT_METERS) continue;
          stationEdges.push({
            from: stationNodeId,
            to: jeepNodeId,
            distance: straightDist * TRICYCLE_DETOUR_FACTOR,
            type: "tricycle",
            stationId: station.id,
            stationName: station.address,
            regionId: region.id,
            isHail: false,
            routeId: jeepNode.routeId,
            routeName: jeepNode.routeName,
          });
          continue;
        }

        // Jeepney outside region — route through a boundary exit node
        const exitPt = nearestBoundaryPoint(jeepPoint, region);
        const exitToJeep = haversineMeters(exitPt, jeepPoint);
        if (exitToJeep > MAX_BOUNDARY_EXIT_WALK_METERS) continue;

        // Dedup: reuse an existing boundary exit within 100 m
        let exitId: string | null = null;
        for (const [id, pt] of boundaryExitNodes) {
          if (haversineMeters(pt, exitPt) < 100) { exitId = id; break; }
        }

        if (!exitId) {
          exitId = `boundary_exit:${region.id}:${boundaryExitNodes.size}`;
          boundaryExitNodes.set(exitId, exitPt);
          nodes.set(exitId, {
            id: exitId,
            lat: exitPt[0],
            lng: exitPt[1],
            routeId: `__tricycle_region__:${region.id}`,
            routeName: region.regionName,
            routeColor: region.regionColor,
            direction: "goingTo",
            polylineIndex: -1,
          });
          baseEdges.set(exitId, []);
        }

        // Station → boundary exit (tricycle, stays inside region)
        if (!addedStationToExit.has(exitId)) {
          addedStationToExit.add(exitId);
          const actualExit = boundaryExitNodes.get(exitId)!;
          const stToExit = haversineMeters(station.point, actualExit) * TRICYCLE_DETOUR_FACTOR;
          stationEdges.push({
            from: stationNodeId,
            to: exitId,
            distance: stToExit,
            type: "tricycle",
            stationId: station.id,
            stationName: station.address,
            regionId: region.id,
            isHail: false,
          });
        }

        // Boundary exit → jeepney (walk)
        const exitEdges = baseEdges.get(exitId)!;
        if (!exitEdges.some(e => e.to === jeepNodeId)) {
          exitEdges.push({
            from: exitId,
            to: jeepNodeId,
            distance: exitToJeep * WALK_DETOUR_FACTOR,
            type: "walk",
          });
        }
      }

      // --- Station → VIRTUAL_END (ride, if destination inside region) ---
      if (endInRegion) {
        const rideDist = haversineMeters(station.point, end) * TRICYCLE_DETOUR_FACTOR;
        stationEdges.push({
          from: stationNodeId,
          to: VIRTUAL_END_ID,
          distance: rideDist,
          type: "tricycle",
          stationId: station.id,
          stationName: station.address,
          regionId: region.id,
          isHail: false,
        });
      }

      // --- Station → boundary drop-off (ride, if near boundary) ---
      if (boundaryDropoff && boundaryDropoffId) {
        const rideDist = haversineMeters(station.point, boundaryDropoff) * TRICYCLE_DETOUR_FACTOR;
        stationEdges.push({
          from: stationNodeId,
          to: boundaryDropoffId,
          distance: rideDist,
          type: "tricycle",
          stationId: station.id,
          stationName: station.address,
          regionId: region.id,
          isHail: false,
        });
      }

      baseEdges.set(stationNodeId, stationEdges);

      // --- Nearby jeepney nodes → station (walk to station for boarding) ---
      for (const jeepNodeId of nearbyJeepNodes) {
        const jeepNode = nodes.get(jeepNodeId)!;
        const walkDist = haversineMeters([jeepNode.lat, jeepNode.lng], station.point) * WALK_DETOUR_FACTOR;

        // Compute backtracking penalty: how much further from destination
        // does walking to this station take you?
        const distFromNodeToEnd = haversineMeters([jeepNode.lat, jeepNode.lng], end);
        const distFromStationToEnd = haversineMeters(station.point, end);
        const detourRatio = distFromNodeToEnd > 0 ? distFromStationToEnd / distFromNodeToEnd : 1;

        let jeepEdges = baseEdges.get(jeepNodeId);
        if (!jeepEdges) {
          jeepEdges = [];
          baseEdges.set(jeepNodeId, jeepEdges);
        }

        // Walk edge to station
        jeepEdges.push({
          from: jeepNodeId,
          to: stationNodeId,
          distance: walkDist,
          type: "walk",
          stationId: station.id,
          stationName: station.address,
          regionId: region.id,
          detourRatio: detourRatio > 1 ? detourRatio : undefined,
        });
      }

      // --- Hail edges: nearby jeepney node → station (for mid-route transfer via tricycle) ---
      // Only create hail edges for nodes close enough that the walk to the station
      // is reasonable. Nodes further than MAX_DIRECT_WALK_INSTEAD_OF_HAIL_METERS are
      // better served by the walk edge (above) or by staying on the jeepney longer.
      // Also set walkToStationDist so the costing model sees the true walk cost that
      // the leg assembler will emit — preventing A* from treating a long walk as a
      // cheap tricycle ride.
      for (const jeepNodeId of nearbyJeepNodes) {
        const jeepNode = nodes.get(jeepNodeId)!;
        const walkToStation = haversineMeters([jeepNode.lat, jeepNode.lng], station.point);

        // Skip if the walk to the station is too far — same cap used for direct hail edges.
        if (walkToStation > MAX_DIRECT_WALK_INSTEAD_OF_HAIL_METERS) continue;

        const rideDist = walkToStation * TRICYCLE_DETOUR_FACTOR;

        let jeepEdges = baseEdges.get(jeepNodeId);
        if (!jeepEdges) {
          jeepEdges = [];
          baseEdges.set(jeepNodeId, jeepEdges);
        }

        jeepEdges.push({
          from: jeepNodeId,
          to: stationNodeId,
          distance: rideDist,
          type: "tricycle",
          stationId: station.id,
          stationName: station.address,
          stationPoint: station.point,
          regionId: region.id,
          isHail: true,
          // The leg assembler will emit a WALK from the alight point to the station.
          // Include this walk distance in costing so A* does not underestimate the
          // true cost of this path.
          walkToStationDist: walkToStation * WALK_DETOUR_FACTOR,
        });
      }

      // --- VIRTUAL_START → station (walk, if start inside region) ---
      if (startInRegion) {
        const walkDist = haversineMeters(start, station.point);
        if (walkDist <= MAX_TRICYCLE_STATION_WALK_METERS) {
          let startEdges = baseEdges.get(VIRTUAL_START_ID);
          if (!startEdges) {
            startEdges = [];
            baseEdges.set(VIRTUAL_START_ID, startEdges);
          }

          // Walk to station
          startEdges.push({
            from: VIRTUAL_START_ID,
            to: stationNodeId,
            distance: walkDist,
            type: "walk",
            stationId: station.id,
            stationName: station.address,
            regionId: region.id,
          });

          // Hail from start (alternative: slightly higher cost, but no walk needed)
          const hailDist = walkDist * TRICYCLE_DETOUR_FACTOR;
          startEdges.push({
            from: VIRTUAL_START_ID,
            to: stationNodeId,
            distance: hailDist,
            type: "tricycle",
            stationId: station.id,
            stationName: station.address,
            stationPoint: station.point,
            regionId: region.id,
            isHail: true,
          });
        }
      }
    }

    // --- Direct hail edges: jeepney node → VIRTUAL_END (if end in region) ---
    // Uses all jeepney nodes in/near the region (polygon + station-proximity).
    // Each hail edge uses the station nearest to the *jeepney node* (not the
    // destination) so the walk-to-station leg is short.
    // Cost = walk(jeep→station) + tricycle(station→end) so that A* prefers
    // alight points close to a station.
    if (endInRegion) {
      for (const jeepNodeId of jeepneyNodesInRegion) {
        const jeepNode = nodes.get(jeepNodeId)!;
        const jeepPoint: LatLng = [jeepNode.lat, jeepNode.lng];

        // If the jeepney node is close enough to the destination to walk
        // directly, skip the hail edge — the walk egress edge will handle it.
        const directToEnd = haversineMeters(jeepPoint, end);
        if (directToEnd < MAX_DIRECT_WALK_INSTEAD_OF_HAIL_METERS) continue;

        // Pick the station closest to where the passenger alights the jeepney
        const nearestStation = availableStations.reduce((best, s) => {
          const d = haversineMeters(jeepPoint, s.point);
          return d < best.dist ? { station: s, dist: d } : best;
        }, { station: availableStations[0], dist: Infinity });

        // Skip hail if the station is too far from the alight point.
        // Walking more than MAX_DIRECT_WALK_INSTEAD_OF_HAIL_METERS to reach
        // a hailing point defeats the purpose of the last-mile tricycle — the
        // passenger would be better served by a later alight node (closer to
        // the station) or a direct walk. This cap is symmetric with the
        // "just walk to destination" guard above.
        // Also skip if the station is farther than the destination itself.
        const walkToStation = nearestStation.dist;
        if (walkToStation > MAX_DIRECT_WALK_INSTEAD_OF_HAIL_METERS) continue;
        if (walkToStation > directToEnd) continue;

        // True cost: walk from jeepney alight to station + tricycle from station to destination
        // Store them separately so costing applies walk rate to the walk portion
        // and tricycle rate to the ride portion.
        const tricycleFromStation = haversineMeters(nearestStation.station.point, end) * TRICYCLE_DETOUR_FACTOR;

        let jeepEdges = baseEdges.get(jeepNodeId);
        if (!jeepEdges) {
          jeepEdges = [];
          baseEdges.set(jeepNodeId, jeepEdges);
        }

        jeepEdges.push({
          from: jeepNodeId,
          to: VIRTUAL_END_ID,
          distance: tricycleFromStation,
          type: "tricycle",
          stationId: nearestStation.station.id,
          stationName: nearestStation.station.address,
          stationPoint: nearestStation.station.point,
          regionId: region.id,
          isHail: true,
          walkToStationDist: walkToStation,
        });
      }
    }

    // --- Boundary drop-off → VIRTUAL_END (walk from boundary to destination) ---
    if (boundaryDropoff && boundaryDropoffId) {
      const walkDist = haversineMeters(boundaryDropoff, end) * WALK_DETOUR_FACTOR;
      let dropoffEdges = baseEdges.get(boundaryDropoffId);
      if (!dropoffEdges) {
        dropoffEdges = [];
        baseEdges.set(boundaryDropoffId, dropoffEdges);
      }
      dropoffEdges.push({
        from: boundaryDropoffId,
        to: VIRTUAL_END_ID,
        distance: walkDist,
        type: "walk",
      });
    }

    // --- Intra-region: START hail → VIRTUAL_END (for Walk→Tricycle→Walk trips) ---
    if (startInRegion && endInRegion) {
      const nearestStation = availableStations.reduce((best, s) => {
        const d = haversineMeters(start, s.point);
        return d < best.dist ? { station: s, dist: d } : best;
      }, { station: availableStations[0], dist: Infinity });

      let startEdges = baseEdges.get(VIRTUAL_START_ID);
      if (!startEdges) {
        startEdges = [];
        baseEdges.set(VIRTUAL_START_ID, startEdges);
      }

      // Direct hail from start to destination within same region
      const rideDist = haversineMeters(start, end) * TRICYCLE_DETOUR_FACTOR;
      startEdges.push({
        from: VIRTUAL_START_ID,
        to: VIRTUAL_END_ID,
        distance: rideDist,
        type: "tricycle",
        stationId: nearestStation.station.id,
        stationName: nearestStation.station.address,
        stationPoint: nearestStation.station.point,
        regionId: region.id,
        isHail: true,
      });
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

  // Apply costs to all base edges (transit + transfer + tricycle)
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
      } else if (base.type === "tricycle") {
        // Tricycle ride cost = ride_distance * factor + wait penalty
        const waitPenalty = base.isHail ? HAILING_WAIT_PENALTY_METERS : STATION_WAIT_PENALTY_METERS;
        cost = base.distance * TRICYCLE_RIDE_COST_FACTOR + waitPenalty;

        // For hail edges: add the walk-to-station portion at the walk rate,
        // not the tricycle rate — otherwise long walks look artificially cheap.
        if (base.walkToStationDist) {
          cost += profileWalkCost(base.walkToStationDist, profile);
        }

        // Boarding cost for the target jeepney route (if riding to a jeepney node)
        if (base.routeId && !base.isHail) {
          cost += (rawBoardingCosts.get(base.routeId) ?? 0) * profile.boardingCostFactor;
        }
      } else {
        // Walk edges (access, egress, walk-to-station)
        let effectiveDist = base.distance;
        // Apply backtracking penalty for walk-to-station edges
        if (base.detourRatio && base.detourRatio > 1) {
          effectiveDist *= Math.min(base.detourRatio, BACKTRACK_PENALTY_MULTIPLIER);
        }
        cost = profileWalkCost(effectiveDist, profile);
      }

      costed.push({
        from: base.from,
        to: base.to,
        distance: base.distance,
        cost,
        type: base.type,
        routeId: base.routeId,
        routeName: base.routeName,
        stationId: base.stationId,
        stationName: base.stationName,
        stationPoint: base.stationPoint,
      });
    }

    adjacency.set(nodeId, costed);
  }

  // Add access edges (VIRTUAL_START → transit nodes)
  // Merge with any existing VIRTUAL_START edges (e.g. tricycle walk-to-station)
  const existingStartEdges = adjacency.get(VIRTUAL_START_ID) ?? [];
  for (const [nodeId, rawDist] of accessDistances) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const walkCost = profileWalkCost(rawDist, profile);
    const boardingCost = (rawBoardingCosts.get(node.routeId) ?? 0) * profile.boardingCostFactor;
    existingStartEdges.push({
      from: VIRTUAL_START_ID,
      to: nodeId,
      distance: rawDist,
      cost: walkCost + boardingCost,
      type: "walk",
      routeId: node.routeId,
      routeName: node.routeName,
    });
  }
  adjacency.set(VIRTUAL_START_ID, existingStartEdges);

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
  now?: Date,
): Promise<{ baseGraph: BaseGraph; transitData: TransitData } | null> {
  const transitData = await loadTransitData();

  if (transitData.routes.length === 0) return null;

  const nodes = buildGraphNodes(transitData.routes);
  const baseEdges = buildBaseTransitEdges(transitData.routes, nodes);

  // Transfer edges (raw — cost computed per profile)
  buildBaseTransferEdges(nodes, baseEdges);

  // Mark closure-affected transit edges
  markClosureEdges(baseEdges, nodes, transitData.closures);

  // Tricycle station nodes & edges (time-window filtered)
  buildTricycleNodesAndEdges(
    transitData.regions, nodes, baseEdges, start, end, now ?? new Date(),
  );

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
