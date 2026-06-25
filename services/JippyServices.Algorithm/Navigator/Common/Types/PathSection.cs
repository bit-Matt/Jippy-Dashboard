namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// A typed segment of an A* node path produced by <see cref="LegAssembler.AnalyzeNodePath"/>.
/// Each section covers one continuous movement by a single mode of transport
/// before leg assembly converts it into a <see cref="RouteLeg"/>.
/// </summary>
internal abstract class PathSection
{
    /// <summary>Mode identifier string: <c>"walk"</c>, <c>"tricycle"</c>, or <c>"transit"</c>.</summary>
    public abstract string Type { get; }
}

/// <summary>
/// A walk section connecting two graph nodes (access, egress, or mid-route walk between transfers).
/// </summary>
internal sealed class WalkSection : PathSection
{
    /// <inheritdoc/>
    public override string Type => "walk";

    /// <summary>The node at which walking begins.</summary>
    public required GraphNode FromNode { get; init; }

    /// <summary>The node at which walking ends.</summary>
    public required GraphNode ToNode { get; init; }
}

/// <summary>
/// A tricycle section covering a single tricycle ride edge in the graph.
/// </summary>
internal sealed class TricycleSection : PathSection
{
    /// <inheritdoc/>
    public override string Type => "tricycle";

    /// <summary>The node at which the tricycle ride starts.</summary>
    public required GraphNode FromNode { get; init; }

    /// <summary>The node at which the tricycle ride ends.</summary>
    public required GraphNode ToNode { get; init; }

    /// <summary>The underlying graph edge carrying distance and station metadata for this ride.</summary>
    public required GraphEdge Edge { get; init; }
}

/// <summary>
/// A jeepney transit section covering consecutive nodes along a single route and direction.
/// Consecutive <see cref="TransitSection"/> instances on the same route are merged by
/// <see cref="NavigatorV2"/> before leg assembly.
/// </summary>
internal sealed class TransitSection : PathSection
{
    /// <inheritdoc/>
    public override string Type => "transit";

    /// <summary>Database ID of the jeepney route.</summary>
    public required string RouteId { get; init; }

    /// <summary>Display name of the jeepney route (e.g. "Cogon - Bulua").</summary>
    public required string RouteName { get; init; }

    /// <summary>Hex colour string for rendering the route on the map.</summary>
    public required string RouteColor { get; init; }

    /// <summary>The direction of travel along the route polyline.</summary>
    public required RouteDirection Direction { get; init; }

    /// <summary>
    /// Ordered list of graph nodes traversed during this transit section.
    /// The list grows as consecutive same-route nodes are merged.
    /// </summary>
    public required List<GraphNode> Nodes { get; init; }
}
