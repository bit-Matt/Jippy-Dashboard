namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// A weighted, directed edge in the transit graph.
/// Cost is computed per weight-profile from the raw distance.
/// </summary>
internal sealed class GraphEdge
{
    /// <summary>ID of the source node.</summary>
    public required string From { get; init; }

    /// <summary>ID of the destination node.</summary>
    public required string To { get; init; }

    /// <summary>Physical distance of this edge in metres.</summary>
    public required double Distance { get; init; }

    /// <summary>
    /// A* cost assigned by <see cref="GraphBuilder.BuildCostedAdjacency"/> for the active
    /// weight profile. A higher cost makes A* avoid this edge. Mutable so that the
    /// cost can be applied in-place without allocating a new edge object.
    /// </summary>
    public required double Cost { get; set; }

    /// <summary>The type of movement this edge represents.</summary>
    public required EdgeType Type { get; init; }

    /// <summary>Route ID associated with this edge, or <see langword="null"/> for walk edges.</summary>
    public string? RouteId { get; init; }

    /// <summary>Display name of the route, or <see langword="null"/> for walk edges.</summary>
    public string? RouteName { get; init; }

    /// <summary>ID of the tricycle station this edge departs from, if applicable.</summary>
    public string? StationId { get; init; }

    /// <summary>Address of the tricycle station this edge departs from, if applicable.</summary>
    public string? StationName { get; init; }

    /// <summary>Geographic position of the tricycle station, if applicable.</summary>
    public LatLng? StationPoint { get; init; }
}
