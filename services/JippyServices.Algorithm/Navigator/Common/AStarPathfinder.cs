using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Navigator.Common;

/// <summary>
/// Composite A* search state. Tracks whether a jeepney has been used on
/// the current path so that tricycle edges can be pruned once the user has
/// boarded a jeepney — preventing the Jeepney → Tricycle → Jeepney pattern.
/// </summary>
public readonly record struct AStarState(string NodeId, bool HasUsedJeepney);

internal static class AStarPathfinder
{
    /// <summary>
    /// Find the optimal path from <paramref name="startId"/> to
    /// <paramref name="endId"/> in the given graph using A*.
    /// Enforces Rule 4: once a jeepney has been used, any tricycle edge
    /// must terminate at the virtual end node (last-mile only).
    /// Returns ordered list of node IDs, or null if no path.
    /// </summary>
    public static List<string>? FindOptimalPath(
        Graph graph,
        string startId,
        string endId,
        WeightProfile? profile = null)
    {
        if (!graph.Nodes.TryGetValue(endId, out var endNode)) return null;

        var maxTransfers = profile?.MaxTransfers;
        var heuristicFactor = profile?.TransitCostFactor ?? 0.5;
        var endLatLng = new LatLng(endNode.Lat, endNode.Lng);
        var trackTransfers = maxTransfers.HasValue;

        var gScore = new Dictionary<AStarState, double>();
        var cameFrom = new Dictionary<AStarState, AStarState>();
        var closedSet = new HashSet<AStarState>();
        var transferCount = new Dictionary<AStarState, int>();

        var startState = new AStarState(startId, HasUsedJeepney: false);
        gScore[startState] = 0;
        transferCount[startState] = 0;

        var startNode = graph.Nodes.GetValueOrDefault(startId);
        var initialF = startNode != null ? Heuristic(startNode, endLatLng, heuristicFactor) : 0;

        // PriorityQueue with lazy deletion via closedSet
        var openSet = new PriorityQueue<AStarState, double>();
        openSet.Enqueue(startState, initialF);

        var iterations = 0;

        while (openSet.Count > 0)
        {
            if (++iterations > RoutingConstants.MaxAStarIterations) return null;

            var currentState = openSet.Dequeue();

            // Lazy deletion: skip stale duplicates
            if (closedSet.Contains(currentState)) continue;

            if (currentState.NodeId == endId)
                return ReconstructNodePath(cameFrom, currentState);

            closedSet.Add(currentState);

            if (!graph.Edges.TryGetValue(currentState.NodeId, out var edges)) continue;

            var currentG = gScore.GetValueOrDefault(currentState, double.PositiveInfinity);
            var currentTransfers = transferCount.GetValueOrDefault(currentState, 0);

            foreach (var edge in edges)
            {
                // Rule 4 — strict enforcement: once a jeepney has been used,
                // a tricycle edge may only lead to the virtual end node (last-mile).
                if (currentState.HasUsedJeepney
                    && edge.Type == EdgeType.Tricycle
                    && edge.To != RoutingConstants.VirtualEndId)
                    continue;

                // Propagate jeepney-used flag: Transit and Transfer edges mean a
                // jeepney has been (or is being) boarded; Walk/Tricycle propagate
                // the current value unchanged.
                var nextHasUsedJeepney = currentState.HasUsedJeepney
                    || edge.Type == EdgeType.Transit
                    || edge.Type == EdgeType.Transfer;

                var nextState = new AStarState(edge.To, nextHasUsedJeepney);

                if (closedSet.Contains(nextState)) continue;

                var newTransfers = currentTransfers;
                if (edge.Type == EdgeType.Transfer) newTransfers++;

                if (trackTransfers && newTransfers > maxTransfers!.Value) continue;

                var tentativeG = currentG + edge.Cost;
                var existingG = gScore.GetValueOrDefault(nextState, double.PositiveInfinity);

                if (tentativeG < existingG)
                {
                    cameFrom[nextState] = currentState;
                    gScore[nextState] = tentativeG;
                    transferCount[nextState] = newTransfers;

                    var neighbor = graph.Nodes.GetValueOrDefault(edge.To);
                    var h = neighbor != null ? Heuristic(neighbor, endLatLng, heuristicFactor) : 0;
                    openSet.Enqueue(nextState, tentativeG + h);
                }
            }
        }

        return null;
    }

    /// <summary>
    /// Admissible A* heuristic: straight-line haversine distance from <paramref name="node"/>
    /// to <paramref name="target"/>, scaled by <paramref name="transitCostFactor"/> to keep it
    /// consistent with transit edge costs. Never overestimates the true cost because
    /// transit edges are also multiplied by the same factor.
    /// </summary>
    private static double Heuristic(GraphNode node, LatLng target, double transitCostFactor)
        => GeoUtils.HaversineMeters(new LatLng(node.Lat, node.Lng), target) * transitCostFactor;

    /// <summary>
    /// Walk the <paramref name="cameFrom"/> map backwards from <paramref name="goalState"/>
    /// to the start and return the node IDs in forward order.
    /// </summary>
    /// <param name="cameFrom">Predecessor map populated during the A* search.</param>
    /// <param name="goalState">The final A* state that reached the destination.</param>
    /// <returns>Ordered list of node IDs from start to destination, inclusive.</returns>
    private static List<string> ReconstructNodePath(
        Dictionary<AStarState, AStarState> cameFrom, AStarState goalState)
    {
        var path = new List<string> { goalState.NodeId };
        var current = goalState;
        while (cameFrom.TryGetValue(current, out var prev))
        {
            path.Add(prev.NodeId);
            current = prev;
        }
        path.Reverse();
        return path;
    }
}
