namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// A* pathfinding over the transit graph.
// Ported from lib/routing/astar.ts
// -------------------------------------------------------------------------

public static class AStarPathfinder
{
    /// <summary>
    /// Find the optimal path from <paramref name="startId"/> to
    /// <paramref name="endId"/> in the given graph using A*.
    /// Optionally enforces a maximum number of vehicle transfers.
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

        var gScore = new Dictionary<string, double>();
        var cameFrom = new Dictionary<string, string>();
        var closedSet = new HashSet<string>();
        var transferCount = new Dictionary<string, int>();
        var arrivalRouteId = new Dictionary<string, string>();

        gScore[startId] = 0;
        transferCount[startId] = 0;
        arrivalRouteId[startId] = "__virtual__";

        var startNode = graph.Nodes.GetValueOrDefault(startId);
        var initialF = startNode != null ? Heuristic(startNode, endLatLng, heuristicFactor) : 0;

        var openSet = new MinHeap();
        openSet.Insert(startId, initialF);

        var iterations = 0;

        while (openSet.Size > 0)
        {
            if (++iterations > RoutingConstants.MaxAStarIterations) return null;

            var current = openSet.ExtractMin()!.Value;
            var currentId = current.NodeId;

            if (currentId == endId)
                return ReconstructNodePath(cameFrom, endId);

            closedSet.Add(currentId);

            if (!graph.Edges.TryGetValue(currentId, out var edges)) continue;

            var currentG = gScore.GetValueOrDefault(currentId, double.PositiveInfinity);
            var currentTransfers = transferCount.GetValueOrDefault(currentId, 0);

            foreach (var edge in edges)
            {
                if (closedSet.Contains(edge.To)) continue;

                // Count transfers
                var newTransfers = currentTransfers;
                if (edge.Type == EdgeType.Transfer) newTransfers++;

                // Prune if exceeds max transfers
                if (trackTransfers && newTransfers > maxTransfers!.Value) continue;

                var tentativeG = currentG + edge.Cost;
                var existingG = gScore.GetValueOrDefault(edge.To, double.PositiveInfinity);

                if (tentativeG < existingG)
                {
                    cameFrom[edge.To] = currentId;
                    gScore[edge.To] = tentativeG;
                    transferCount[edge.To] = newTransfers;
                    arrivalRouteId[edge.To] = edge.RouteId ?? arrivalRouteId.GetValueOrDefault(currentId, "__virtual__");

                    var neighbor = graph.Nodes.GetValueOrDefault(edge.To);
                    var h = neighbor != null ? Heuristic(neighbor, endLatLng, heuristicFactor) : 0;
                    var f = tentativeG + h;

                    openSet.Insert(edge.To, f);
                }
            }
        }

        return null;
    }

    private static double Heuristic(GraphNode node, LatLng target, double transitCostFactor)
        => GeoUtils.HaversineMeters(new LatLng(node.Lat, node.Lng), target) * transitCostFactor;

    private static List<string> ReconstructNodePath(Dictionary<string, string> cameFrom, string endId)
    {
        var path = new List<string> { endId };
        var current = endId;

        while (cameFrom.TryGetValue(current, out var prev))
        {
            path.Add(prev);
            current = prev;
        }

        path.Reverse();
        return path;
    }
}
