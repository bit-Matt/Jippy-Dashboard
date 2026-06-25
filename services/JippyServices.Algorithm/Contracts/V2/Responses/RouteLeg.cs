using System.Text.Json.Serialization;
using JippyServices.Algorithm.Navigator.V2;

namespace JippyServices.Algorithm.Contracts.V2.Responses;

/// <summary>
/// A single segment of a route, representing one continuous movement by a
/// specific mode of transport (walking, jeepney, or tricycle).
/// </summary>
internal sealed class RouteLeg
{
    /// <summary>The mode of transport for this leg.</summary>
    [JsonPropertyName("type")]
    public required LegType Type { get; init; }

    /// <summary>
    /// Display name of the transit route (e.g. "Cogon - Bulua"), or <see langword="null"/> for walk legs.
    /// </summary>
    [JsonPropertyName("route_name")]
    public required string? RouteName { get; init; }

    /// <summary>
    /// Internal database ID of the transit route, or <see langword="null"/> for walk legs.
    /// </summary>
    [JsonPropertyName("route_id")]
    public required string? RouteId { get; init; }

    /// <summary>
    /// Route number shown on the vehicle (e.g. "01A"), or <see langword="null"/> for walk legs.
    /// </summary>
    [JsonPropertyName("route_number")]
    public required string? RouteNumber { get; init; }

    /// <summary>Google-encoded polyline (precision 1e6) for this leg's geometry.</summary>
    [JsonPropertyName("polyline")]
    public required string Polyline { get; init; }

    /// <summary>
    /// Hex colour string for the route line on the map, or <see langword="null"/> for walk legs.
    /// </summary>
    [JsonPropertyName("color")]
    public required string? Color { get; init; }

    /// <summary>Leg distance in metres.</summary>
    [JsonPropertyName("distance")]
    public required double Distance { get; init; }

    /// <summary>Estimated leg duration in seconds.</summary>
    [JsonPropertyName("duration")]
    public required double Duration { get; init; }

    /// <summary>Ordered turn-by-turn instructions for this leg.</summary>
    [JsonPropertyName("instructions")]
    public required List<Instruction> Instructions { get; init; }

    /// <summary>Bounding box for this leg: <c>[minLng, minLat, maxLng, maxLat]</c>.</summary>
    [JsonPropertyName("bbox")]
    public required double[] Bbox { get; init; }
}

/// <summary>The mode of transport for a <see cref="RouteLeg"/>.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<LegType>))]
internal enum LegType
{
    /// <summary>On-foot walking segment.</summary>
    [JsonStringEnumMemberName("WALK")] Walk,

    /// <summary>Tricycle (motorcycle sidecar) segment.</summary>
    [JsonStringEnumMemberName("TRICYCLE")] Tricycle,

    /// <summary>Jeepney (shared PUV) segment.</summary>
    [JsonStringEnumMemberName("JEEPNEY")] Jeepney,
}
