namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// The reusable base graph. Built once per request, then applied to
/// multiple weight profiles without additional I/O.
/// </summary>
internal sealed class BaseGraph
{
    /// <summary>
    /// All graph nodes keyed by node ID. Includes both transit nodes (one per polyline vertex)
    /// and virtual start/end nodes for the origin and destination.
    /// </summary>
    public required Dictionary<string, GraphNode> Nodes { get; init; }

    /// <summary>
    /// Uncosted adjacency list (source node ID → outgoing edges) used as the template
    /// for generating per-profile costed adjacency lists via <see cref="GraphBuilder.BuildCostedAdjacency"/>.
    /// </summary>
    public required Dictionary<string, List<BaseEdge>> BaseEdges { get; init; }

    /// <summary>
    /// Per-node raw boarding cost in metres, pre-computed from fleet count and departure frequency.
    /// Applied during cost computation as a wait-time penalty before boarding a jeepney.
    /// </summary>
    public required Dictionary<string, double> RawBoardingCosts { get; init; }

    /// <summary>
    /// OSRM foot walk distances (in metres) from the trip origin to nearby transit nodes.
    /// Keyed by node ID. Only nodes within the configured access radius are included.
    /// </summary>
    public required Dictionary<string, double> AccessWalkDistances { get; init; }

    /// <summary>
    /// OSRM foot walk distances (in metres) from nearby transit nodes to the trip destination.
    /// Keyed by node ID. Only nodes within the configured egress radius are included.
    /// </summary>
    public required Dictionary<string, double> EgressWalkDistances { get; init; }

    /// <summary>
    /// <see langword="true"/> when at least one transit node is reachable from the origin
    /// within the configured walk radius.
    /// </summary>
    public required bool HasAccessEdges { get; init; }

    /// <summary>
    /// <see langword="true"/> when at least one transit node can reach the destination
    /// within the configured walk radius.
    /// </summary>
    public required bool HasEgressEdges { get; init; }

    /// <summary>
    /// Node IDs that fall within a restricted boarding zone. A* will not create
    /// boarding, alighting, or transfer edges for these nodes.
    /// </summary>
    public required HashSet<string> StopRestrictedNodes { get; init; }
}
