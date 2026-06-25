namespace JippyServices.Algorithm.Navigator.Common;

/// <summary>
/// Fixed routing algorithm parameters that are not exposed through the weights system
/// and require a service redeploy to change. These values guard against pathological
/// inputs and define the virtual node identifiers used throughout the graph.
/// </summary>
public static class RoutingConstants
{
    /// <summary>
    /// Maximum number of A* state expansions before the search is aborted and
    /// <see langword="null"/> is returned. Prevents runaway searches on extremely
    /// large or disconnected graphs.
    /// </summary>
    public const int MaxAStarIterations = 50_000;

    /// <summary>
    /// Synthetic node ID injected into the graph to represent the user's origin.
    /// Access walk edges connect this node to nearby transit boarding nodes.
    /// </summary>
    public const string VirtualStartId = "__start__";

    /// <summary>
    /// Synthetic node ID injected into the graph to represent the user's destination.
    /// Egress walk edges connect nearby transit alighting nodes to this node.
    /// </summary>
    public const string VirtualEndId = "__end__";
}
