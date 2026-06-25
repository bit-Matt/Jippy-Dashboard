namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// An intermediate representation of a contiguous jeepney segment used during polyline
/// trimming in <see cref="LegAssembler"/>. Holds the ordered nodes for one transit leg
/// before the final polyline is extracted and clipped to boarding/alighting coordinates.
/// </summary>
internal sealed class PathSegment
{
    /// <summary>Database ID of the jeepney route.</summary>
    public required string RouteId { get; init; }

    /// <summary>Direction of travel along the route polyline.</summary>
    public required RouteDirection Direction { get; init; }

    /// <summary>Display name of the route (e.g. "Cogon - Bulua").</summary>
    public required string RouteName { get; init; }

    /// <summary>Hex colour string for rendering the route on the map.</summary>
    public required string RouteColor { get; init; }

    /// <summary>
    /// Ordered list of graph nodes traversed in this segment, from boarding to alighting.
    /// </summary>
    public required List<GraphNode> Nodes { get; init; }
}
