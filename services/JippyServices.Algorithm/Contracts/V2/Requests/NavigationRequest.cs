using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Contracts.V2.Requests;

/// <summary>
/// Request body for the <c>POST /navigate/v2</c> endpoint.
/// Specifies the origin and destination for a transit route computation.
/// </summary>
internal sealed class NavigationRequest
{
    /// <summary>The trip origin coordinate.</summary>
    [JsonPropertyName("start")]
    public LatLngObject Start { get; init; } = null!;

    /// <summary>The trip destination coordinate.</summary>
    [JsonPropertyName("end")]
    public LatLngObject End { get; init; } = null!;
}
