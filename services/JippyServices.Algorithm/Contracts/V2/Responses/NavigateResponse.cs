using System.Text.Json.Serialization;
using JippyServices.Algorithm.Navigator.V2;

namespace JippyServices.Algorithm.Contracts.V2.Responses;

/// <summary>
/// A fully assembled route returned as part of a <see cref="RouteSuggestion"/>.
/// Summarises the individual legs and provides aggregate trip metrics.
/// </summary>
internal sealed class NavigateResponse
{
    /// <summary>Ordered list of route legs (walk, jeepney, tricycle segments).</summary>
    [JsonPropertyName("legs")]
    public required List<RouteLeg> Legs { get; init; }

    /// <summary>Sum of all leg distances in metres, rounded to two decimal places.</summary>
    [JsonPropertyName("total_distance")]
    public required double TotalDistance { get; init; }

    /// <summary>Sum of all leg durations in seconds, rounded to the nearest second.</summary>
    [JsonPropertyName("total_duration")]
    public required double TotalDuration { get; init; }

    /// <summary>
    /// Number of transit vehicle changes in this route.
    /// A walk-only route has 0 transfers; a route using two different jeepney lines has 1.
    /// </summary>
    [JsonPropertyName("total_transfers")]
    public required int TotalTransfers { get; init; }

    /// <summary>
    /// Bounding box enclosing all legs: <c>[minLng, minLat, maxLng, maxLat]</c>.
    /// Used by the client to fit the map view to the route.
    /// </summary>
    [JsonPropertyName("global_bbox")]
    public required double[] GlobalBbox { get; init; }
}
