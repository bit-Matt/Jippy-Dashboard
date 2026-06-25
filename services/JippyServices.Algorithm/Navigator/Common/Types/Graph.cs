namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// A fully costed transit graph ready for A* search.
/// Created from a <see cref="BaseGraph"/> by applying a <see cref="WeightProfile"/>
/// via <see cref="GraphBuilder.BuildCostedAdjacency"/>.
/// </summary>
internal sealed class Graph
{
    /// <summary>All graph nodes keyed by node ID, shared with the parent <see cref="BaseGraph"/>.</summary>
    public required Dictionary<string, GraphNode> Nodes { get; init; }

    /// <summary>
    /// Costed adjacency list (source node ID → outgoing <see cref="GraphEdge"/> list).
    /// Each edge's <see cref="GraphEdge.Cost"/> reflects the active weight profile.
    /// </summary>
    public required Dictionary<string, List<GraphEdge>> Edges { get; init; }
}
