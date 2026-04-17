// ---------------------------------------------------------------------------
// Main routing orchestrator — multi-suggestion with weight profiles
// ---------------------------------------------------------------------------

import {
  buildBaseGraph,
  buildCostedAdjacency,
  haversineMeters,
} from "@/lib/routing/graph-builder";
import type { BaseGraph } from "@/lib/routing/graph-builder";
import { findOptimalPath, reconstructPath } from "@/lib/routing/astar";
import {
  buildWalkOnlyRoute,
  buildAccessLeg,
  buildTransitLegs,
  buildEgressLeg,
} from "@/lib/routing/leg-assembler";
import {
  WALK_ONLY_THRESHOLD_METERS,
  MIN_TRANSIT_RIDE_METERS,
  VIRTUAL_START_ID,
  VIRTUAL_END_ID,
  PROFILE_FASTEST,
  PROFILE_LEAST_WALKING,
  PROFILE_SIMPLEST,
  EXPLORER_DIVERSITY_PENALTY,
  EXPLORER_MAX_TRANSFERS,
  EXPLORER_DURATION_CAP,
} from "@/lib/routing/constants";
import type {
  Graph,
  LatLng,
  NavigateResponse,
  MultiNavigateResponse,
  RouteSuggestion,
  SuggestionLabel,
  PathSegment,
  RouteLeg,
  TransitData,
  WeightProfile,
} from "@/lib/routing/types";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function computeRoute(
  start: LatLng,
  end: LatLng,
): Promise<MultiNavigateResponse> {
  const straightLineDistance = haversineMeters(start, end);
  if (straightLineDistance < WALK_ONLY_THRESHOLD_METERS) {
    const walkOnly = assembleResponse(await buildWalkOnlyRoute(start, end));
    return { suggestions: [{ label: "fastest", route: walkOnly }] };
  }

  const result = await buildBaseGraph(start, end);
  if (!result) {
    const walkOnly = assembleResponse(await buildWalkOnlyRoute(start, end));
    return { suggestions: [{ label: "fastest", route: walkOnly }] };
  }

  const { baseGraph, transitData } = result;

  if (!baseGraph.hasAccessEdges || !baseGraph.hasEgressEdges) {
    const walkOnly = assembleResponse(await buildWalkOnlyRoute(start, end));
    return { suggestions: [{ label: "fastest", route: walkOnly }] };
  }

  // Run profiles — each is pure computation on the shared base graph
  const [fastest, leastWalking, simplest] = await Promise.all([
    runProfile("fastest", PROFILE_FASTEST, baseGraph, transitData, start, end),
    runProfile("least_walking", PROFILE_LEAST_WALKING, baseGraph, transitData, start, end),
    runProfile("simplest", PROFILE_SIMPLEST, baseGraph, transitData, start, end),
  ]);

  const suggestions: RouteSuggestion[] = [];
  if (fastest) suggestions.push(fastest);
  if (leastWalking) suggestions.push(leastWalking);
  if (simplest) suggestions.push(simplest);

  // Explorer: penalise fastest route's transit lines, re-run with transfer cap
  if (fastest) {
    const explorer = await runExplorerProfile(
      fastest.route,
      baseGraph,
      transitData,
      start,
      end,
    );
    if (explorer) suggestions.push(explorer);
  }

  const deduped = deduplicateSuggestions(suggestions);

  if (deduped.length === 0) {
    const walkOnly = assembleResponse(await buildWalkOnlyRoute(start, end));
    return { suggestions: [{ label: "fastest", route: walkOnly }] };
  }

  return { suggestions: deduped };
}

// ---------------------------------------------------------------------------
// Run a single weight profile
// ---------------------------------------------------------------------------

async function runProfile(
  label: SuggestionLabel,
  profile: WeightProfile,
  base: BaseGraph,
  transitData: TransitData,
  start: LatLng,
  end: LatLng,
): Promise<RouteSuggestion | null> {
  const adjacency = buildCostedAdjacency(
    base.baseEdges,
    base.rawBoardingCosts,
    base.accessWalkDistances,
    base.egressWalkDistances,
    base.nodes,
    profile,
  );

  const graph: Graph = { nodes: base.nodes, edges: adjacency };
  const nodePath = findOptimalPath(graph, VIRTUAL_START_ID, VIRTUAL_END_ID, profile);
  if (!nodePath || nodePath.length < 2) return null;

  const legs = await assembleLegs(nodePath, graph, transitData, start, end);
  if (!legs) return null;

  return { label, route: assembleResponse(legs) };
}

// ---------------------------------------------------------------------------
// Explorer route — topologically diverse alternative
// ---------------------------------------------------------------------------

async function runExplorerProfile(
  fastestResponse: NavigateResponse,
  base: BaseGraph,
  transitData: TransitData,
  start: LatLng,
  end: LatLng,
): Promise<RouteSuggestion | null> {
  const fastestRouteIds = new Set<string>();
  for (const leg of fastestResponse.legs) {
    if (leg.type === "JEEPNEY" && leg.route_name) {
      for (const route of transitData.routes) {
        if (route.routeName === leg.route_name) {
          fastestRouteIds.add(route.id);
        }
      }
    }
  }
  if (fastestRouteIds.size === 0) return null;

  const explorerProfile: WeightProfile = {
    ...PROFILE_FASTEST,
    penalizedRouteIds: fastestRouteIds,
    diversityPenalty: EXPLORER_DIVERSITY_PENALTY,
    maxTransfers: EXPLORER_MAX_TRANSFERS,
  };

  const adjacency = buildCostedAdjacency(
    base.baseEdges,
    base.rawBoardingCosts,
    base.accessWalkDistances,
    base.egressWalkDistances,
    base.nodes,
    explorerProfile,
  );

  const graph: Graph = { nodes: base.nodes, edges: adjacency };
  const nodePath = findOptimalPath(graph, VIRTUAL_START_ID, VIRTUAL_END_ID, explorerProfile);
  if (!nodePath || nodePath.length < 2) return null;

  const legs = await assembleLegs(nodePath, graph, transitData, start, end);
  if (!legs) return null;

  const explorerResponse = assembleResponse(legs);

  // Time cap: discard if significantly slower than fastest
  if (explorerResponse.total_duration > fastestResponse.total_duration * EXPLORER_DURATION_CAP) {
    return null;
  }

  return { label: "explorer", route: explorerResponse };
}

// ---------------------------------------------------------------------------
// Shared leg assembly from A* path
// ---------------------------------------------------------------------------

async function assembleLegs(
  nodePath: string[],
  graph: Graph,
  transitData: TransitData,
  start: LatLng,
  end: LatLng,
): Promise<RouteLeg[] | null> {
  let segments = reconstructPath(nodePath, graph);
  if (segments.length === 0) return null;

  segments = mergeSameRouteSegments(segments);
  segments = filterShortSegments(segments);
  if (segments.length === 0) return null;

  const allLegs: RouteLeg[] = [];

  const firstSegment = segments[0];
  const firstBoardingNode: LatLng = [firstSegment.nodes[0].lat, firstSegment.nodes[0].lng];
  const accessLegs = await buildAccessLeg(start, firstBoardingNode, transitData.regions);
  allLegs.push(...accessLegs);

  const transitLegs = await buildTransitLegs(segments, graph);
  allLegs.push(...transitLegs);

  const lastSegment = segments[segments.length - 1];
  const lastAlightNode: LatLng = [
    lastSegment.nodes[lastSegment.nodes.length - 1].lat,
    lastSegment.nodes[lastSegment.nodes.length - 1].lng,
  ];
  const egressLegs = await buildEgressLeg(lastAlightNode, end, transitData.regions);
  allLegs.push(...egressLegs);

  return allLegs;
}

// ---------------------------------------------------------------------------
// Deduplication — by route-name sequence + transfer count
// ---------------------------------------------------------------------------

function deduplicateSuggestions(suggestions: RouteSuggestion[]): RouteSuggestion[] {
  const seen = new Set<string>();
  const result: RouteSuggestion[] = [];

  for (const s of suggestions) {
    const routeNames = s.route.legs
      .filter((l) => l.type === "JEEPNEY" && l.route_name)
      .map((l) => l.route_name!)
      .sort()
      .join("|");
    const key = `${routeNames}::${s.route.total_transfers}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Merge consecutive segments on the same route (prevents false transfers)
// ---------------------------------------------------------------------------

function mergeSameRouteSegments(segments: PathSegment[]): PathSegment[] {
  if (segments.length <= 1) return segments;

  const merged: PathSegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (prev.routeId === curr.routeId) {
      prev.nodes.push(...curr.nodes);
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Filter out transit segments too short to justify boarding
// ---------------------------------------------------------------------------

function filterShortSegments(segments: PathSegment[]): PathSegment[] {
  return segments.filter((seg) => {
    let dist = 0;
    for (let i = 0; i < seg.nodes.length - 1; i++) {
      const a = seg.nodes[i];
      const b = seg.nodes[i + 1];
      dist += haversineMeters([a.lat, a.lng], [b.lat, b.lng]);
    }
    return dist >= MIN_TRANSIT_RIDE_METERS;
  });
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

    if (
      i > 0 &&
      leg.type === "JEEPNEY" &&
      legs[i - 1].type === "JEEPNEY"
    ) {
      totalTransfers++;
    }

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
