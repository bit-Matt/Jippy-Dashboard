// ---------------------------------------------------------------------------
// A* pathfinding over the transit graph
// ---------------------------------------------------------------------------

import { MinHeap } from "@/lib/routing/min-heap";
import { haversineMeters } from "@/lib/routing/graph-builder";
import { MAX_ASTAR_ITERATIONS } from "@/lib/routing/constants";
import type { Graph, GraphNode, PathSegment, LatLng, WeightProfile } from "@/lib/routing/types";

/**
 * Finds the optimal path from `startId` to `endId` in the given graph using A*.
 * Optionally enforces a maximum number of vehicle transfers.
 *
 * @returns Ordered array of node IDs from start to end, or `null` if no path.
 */
export function findOptimalPath(
  graph: Graph,
  startId: string,
  endId: string,
  profile?: WeightProfile,
): string[] | null {
  const endNode = graph.nodes.get(endId);
  if (!endNode) return null;

  const maxTransfers = profile?.maxTransfers;
  const heuristicFactor = profile?.transitCostFactor ?? 0.5;
  const endLatLng: LatLng = [endNode.lat, endNode.lng];

  // When maxTransfers is set, state key includes transfer count for pruning
  const trackTransfers = maxTransfers !== undefined;

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const closedSet = new Set<string>();
  // Transfer count at each node along the best path found so far
  const transferCount = new Map<string, number>();
  // Track which routeId the path was on when arriving at each node
  const arrivalRouteId = new Map<string, string>();

  gScore.set(startId, 0);
  fScore.set(startId, heuristic(graph.nodes.get(startId)!, endLatLng, heuristicFactor));
  transferCount.set(startId, 0);
  arrivalRouteId.set(startId, "__virtual__");

  const openSet = new MinHeap();
  openSet.insert(startId, fScore.get(startId)!);

  let iterations = 0;

  while (openSet.size > 0) {
    if (++iterations > MAX_ASTAR_ITERATIONS) {
      return null;
    }

    const current = openSet.extractMin()!;
    const currentId = current.nodeId;

    if (currentId === endId) {
      return reconstructNodePath(cameFrom, endId);
    }

    closedSet.add(currentId);

    const edges = graph.edges.get(currentId);
    if (!edges) continue;

    const currentG = gScore.get(currentId) ?? Infinity;
    const currentTransfers = transferCount.get(currentId) ?? 0;
    const currentRouteId = arrivalRouteId.get(currentId) ?? "__virtual__";

    for (const edge of edges) {
      if (closedSet.has(edge.to)) continue;

      // Count transfers: a transfer edge (type=transfer) is always a transfer
      let newTransfers = currentTransfers;
      if (edge.type === "transfer") {
        newTransfers++;
      }

      // Prune if exceeds max transfers
      if (trackTransfers && newTransfers > maxTransfers!) continue;

      const tentativeG = currentG + edge.cost;
      const existingG = gScore.get(edge.to) ?? Infinity;

      if (tentativeG < existingG) {
        cameFrom.set(edge.to, currentId);
        gScore.set(edge.to, tentativeG);
        transferCount.set(edge.to, newTransfers);
        arrivalRouteId.set(edge.to, edge.routeId ?? currentRouteId);

        const neighbor = graph.nodes.get(edge.to);
        const h = neighbor ? heuristic(neighbor, endLatLng, heuristicFactor) : 0;
        const f = tentativeG + h;
        fScore.set(edge.to, f);

        openSet.insert(edge.to, f);
      }
    }
  }

  return null;
}

/**
 * Reconstructs the path sequence and groups consecutive same-route nodes
 * into PathSegments, identifying transfer points.
 */
export function reconstructPath(
  nodePath: string[],
  graph: Graph,
): PathSegment[] {
  if (nodePath.length === 0) return [];

  const segments: PathSegment[] = [];
  let currentSegment: PathSegment | null = null;

  for (const nodeId of nodePath) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    // Skip virtual nodes in segmentation
    if (node.routeId === "__virtual__") continue;

    // Check if we need a new segment (route/direction changed)
    if (
      !currentSegment ||
      currentSegment.routeId !== node.routeId ||
      currentSegment.direction !== node.direction
    ) {
      currentSegment = {
        routeId: node.routeId,
        direction: node.direction,
        routeName: node.routeName,
        routeColor: node.routeColor,
        nodes: [],
      };
      segments.push(currentSegment);
    }

    currentSegment.nodes.push(node);
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function heuristic(node: GraphNode, target: LatLng, transitCostFactor: number): number {
  return haversineMeters([node.lat, node.lng], target) * transitCostFactor;
}

function reconstructNodePath(cameFrom: Map<string, string>, endId: string): string[] {
  const path: string[] = [endId];
  let current = endId;

  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    path.push(current);
  }

  return path.reverse();
}
