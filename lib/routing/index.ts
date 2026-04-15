// ---------------------------------------------------------------------------
// Main routing orchestrator
// ---------------------------------------------------------------------------

import {
  loadTransitData,
  buildGraphNodes,
  buildTransitEdges,
  buildTransferEdges,
  applyClosurePenalties,
  injectUserNodes,
  haversineMeters,
} from "@/lib/routing/graph-builder";
import { findOptimalPath, reconstructPath } from "@/lib/routing/astar";
import {
  buildWalkOnlyRoute,
  buildAccessLeg,
  buildTransitLegs,
  buildEgressLeg,
} from "@/lib/routing/leg-assembler";
import {
  WALK_ONLY_THRESHOLD_METERS,
  VIRTUAL_START_ID,
  VIRTUAL_END_ID,
} from "@/lib/routing/constants";
import type { Graph, LatLng, NavigateResponse, RouteLeg } from "@/lib/routing/types";

/**
 * Computes the optimal multimodal route from `start` to `end`.
 * Returns a NavigateResponse with legs, totals, and global bbox.
 */
export async function computeRoute(
  start: LatLng,
  end: LatLng,
): Promise<NavigateResponse> {
  // -----------------------------------------------------------------------
  // Fallback 1: If A→B < 200m, return pure walk
  // -----------------------------------------------------------------------
  const straightLineDistance = haversineMeters(start, end);
  if (straightLineDistance < WALK_ONLY_THRESHOLD_METERS) {
    return assembleResponse(await buildWalkOnlyRoute(start, end));
  }

  // -----------------------------------------------------------------------
  // Load all published transit data from database
  // -----------------------------------------------------------------------
  const transitData = await loadTransitData();

  // If no routes at all, walk-only
  if (transitData.routes.length === 0) {
    return assembleResponse(await buildWalkOnlyRoute(start, end));
  }

  // -----------------------------------------------------------------------
  // Build graph
  // -----------------------------------------------------------------------
  const nodes = buildGraphNodes(transitData.routes);
  const adjacency = buildTransitEdges(transitData.routes, nodes);

  // Build transfer edges between nearby nodes of different routes
  buildTransferEdges(nodes, adjacency);

  // Apply closure penalties
  applyClosurePenalties(adjacency, nodes, transitData.closures);

  // Inject virtual start/end nodes
  const { hasAccessEdges, hasEgressEdges } = injectUserNodes(
    start,
    end,
    transitData.routes,
    nodes,
    adjacency,
  );

  // -----------------------------------------------------------------------
  // Fallback 2: If no nearby transit from A or B (>5km), return walk-only
  // -----------------------------------------------------------------------
  if (!hasAccessEdges || !hasEgressEdges) {
    return assembleResponse(await buildWalkOnlyRoute(start, end));
  }

  // -----------------------------------------------------------------------
  // Run A* pathfinding
  // -----------------------------------------------------------------------
  const graph: Graph = { nodes, edges: adjacency };
  const nodePath = findOptimalPath(graph, VIRTUAL_START_ID, VIRTUAL_END_ID);

  if (!nodePath || nodePath.length < 2) {
    // No transit path found — fall back to walk-only
    return assembleResponse(await buildWalkOnlyRoute(start, end));
  }

  // -----------------------------------------------------------------------
  // Reconstruct path into segments
  // -----------------------------------------------------------------------
  const segments = reconstructPath(nodePath, graph);

  if (segments.length === 0) {
    return assembleResponse(await buildWalkOnlyRoute(start, end));
  }

  // -----------------------------------------------------------------------
  // Assemble legs
  // -----------------------------------------------------------------------
  const allLegs: RouteLeg[] = [];

  // Access leg: start → first boarding node
  const firstSegment = segments[0];
  const firstBoardingNode: LatLng = [firstSegment.nodes[0].lat, firstSegment.nodes[0].lng];
  const accessLegs = await buildAccessLeg(start, firstBoardingNode, transitData.regions);
  allLegs.push(...accessLegs);

  // Transit legs (jeepney)
  const transitLegs = await buildTransitLegs(segments, graph);
  allLegs.push(...transitLegs);

  // Egress leg: last alighting node → destination
  const lastSegment = segments[segments.length - 1];
  const lastAlightNode: LatLng = [
    lastSegment.nodes[lastSegment.nodes.length - 1].lat,
    lastSegment.nodes[lastSegment.nodes.length - 1].lng,
  ];
  const egressLegs = await buildEgressLeg(lastAlightNode, end, transitData.regions);
  allLegs.push(...egressLegs);

  return assembleResponse(allLegs);
}

// ---------------------------------------------------------------------------
// Response assembly helper
// ---------------------------------------------------------------------------

function assembleResponse(legs: RouteLeg[]): NavigateResponse {
  let totalDistance = 0;
  let totalDuration = 0;
  let totalTransfers = 0;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    totalDistance += leg.distance;
    totalDuration += leg.duration;

    // Count transfers: a JEEPNEY leg following another JEEPNEY leg
    if (
      i > 0 &&
      leg.type === "JEEPNEY" &&
      legs[i - 1].type === "JEEPNEY"
    ) {
      totalTransfers++;
    }

    // Expand global bbox
    const [bMinLng, bMinLat, bMaxLng, bMaxLat] = leg.bbox;
    if (bMinLng < minLng) minLng = bMinLng;
    if (bMinLat < minLat) minLat = bMinLat;
    if (bMaxLng > maxLng) maxLng = bMaxLng;
    if (bMaxLat > maxLat) maxLat = bMaxLat;
  }

  return {
    legs,
    total_distance: Math.round(totalDistance * 100) / 100,
    total_duration: Math.round(totalDuration),
    total_transfers: totalTransfers,
    global_bbox: [
      minLng === Infinity ? 0 : minLng,
      minLat === Infinity ? 0 : minLat,
      maxLng === -Infinity ? 0 : maxLng,
      maxLat === -Infinity ? 0 : maxLat,
    ],
  };
}
