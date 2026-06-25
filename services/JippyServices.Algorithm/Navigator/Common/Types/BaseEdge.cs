namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// A raw edge in the base graph — carries distance but no profile cost.
/// Enriched with metadata for tricycle, closure, and transfer edges.
/// </summary>
internal sealed class BaseEdge
{
    /// <summary>ID of the source node.</summary>
    public required string From { get; init; }

    /// <summary>ID of the destination node.</summary>
    public required string To { get; init; }

    /// <summary>Physical distance of this edge in metres (pre-profile; used as the basis for cost calculation).</summary>
    public required double Distance { get; init; }

    /// <summary>The type of movement this edge represents.</summary>
    public required EdgeType Type { get; init; }

    /// <summary>Route ID for transit/transfer edges, or <see langword="null"/> for walk edges.</summary>
    public string? RouteId { get; init; }

    /// <summary>Display name of the transit route, or <see langword="null"/> for walk edges.</summary>
    public string? RouteName { get; init; }

    /// <summary>
    /// For transfer edges: the physical walk distance between the alighting and boarding points
    /// used to compute the transfer cost penalty.
    /// </summary>
    public double? TransferWalkDist { get; init; }

    /// <summary>
    /// Set to <see langword="true"/> when this edge intersects an active road closure polygon.
    /// A closure penalty multiplier is applied during cost computation.
    /// </summary>
    public bool ClosureAffected { get; set; }

    /// <summary>ID of the tricycle station this edge departs from, if applicable.</summary>
    public string? StationId { get; init; }

    /// <summary>Address of the tricycle station this edge departs from, if applicable.</summary>
    public string? StationName { get; init; }

    /// <summary>Geographic position of the tricycle station, if applicable.</summary>
    public LatLng? StationPoint { get; init; }

    /// <summary>ID of the tricycle region this edge belongs to, if applicable.</summary>
    public string? RegionId { get; init; }

    /// <summary>
    /// <see langword="true"/> for tricycle edges reached by hailing from the road
    /// (no station walk required); <see langword="false"/> for station-departure edges.
    /// </summary>
    public bool IsHail { get; init; }

    /// <summary>
    /// Walk distance from the user's position to the tricycle station, in metres.
    /// Used to model the first-mile penalty before boarding a station-based tricycle.
    /// </summary>
    public double? WalkToStationDist { get; init; }

    /// <summary>
    /// Ratio of the OSRM routed distance to the straight-line haversine distance.
    /// Values significantly above 1.0 indicate a circuitous road route
    /// and are used to apply a detour penalty during cost computation.
    /// </summary>
    public double? DetourRatio { get; init; }
}
