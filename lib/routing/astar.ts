// ---------------------------------------------------------------------------
// A* pathfinding over the transit graph
// ---------------------------------------------------------------------------

import { MinHeap } from "@/lib/routing/min-heap";
import { haversineMeters } from "@/lib/routing/graph-builder";
import { MAX_ASTAR_ITERATIONS } from "@/lib/routing/constants";
import type { Graph, GraphNode, PathSegment, LatLng } from "@/lib/routing/types";

/**
 * Finds the optimal path from `startId` to `endId` in the given graph using A*.
 *
 * @returns Ordered array of node IDs from start to end, or `null` if no path.
 */
export function findOptimalPath(
  graph: Graph,
  startId: string,
  endId: string,
): string[] | null {
  const endNode = graph.nodes.get(endId);
  if (!endNode) return null;

  const endLatLng: LatLng = [endNode.lat, endNode.lng];

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const closedSet = new Set<string>();

  gScore.set(startId, 0);
  fScore.set(startId, heuristic(graph.nodes.get(startId)!, endLatLng));

  const openSet = new MinHeap();
  openSet.insert(startId, fScore.get(startId)!);

  let iterations = 0;

  while (openSet.size > 0) {
    if (++iterations > MAX_ASTAR_ITERATIONS) {
      return null; // Safety cap
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

    for (const edge of edges) {
      if (closedSet.has(edge.to)) continue;

      const tentativeG = currentG + edge.cost;
      const existingG = gScore.get(edge.to) ?? Infinity;

      if (tentativeG < existingG) {
        cameFrom.set(edge.to, currentId);
        gScore.set(edge.to, tentativeG);

        const neighbor = graph.nodes.get(edge.to);
        const h = neighbor ? heuristic(neighbor, endLatLng) : 0;
        const f = tentativeG + h;
        fScore.set(edge.to, f);

        openSet.insert(edge.to, f);
      }
    }
  }

  return null; // No path found
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

function heuristic(node: GraphNode, target: LatLng): number {
  return haversineMeters([node.lat, node.lng], target);
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
