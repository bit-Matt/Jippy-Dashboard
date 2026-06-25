using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Contracts.V2.Responses;

/// <summary>
/// A single ranked route suggestion returned inside <see cref="MultiNavigateResponse"/>.
/// </summary>
internal sealed class RouteSuggestion
{
    /// <summary>
    /// Human-readable transfer count label shown in the UI:
    /// <c>"Direct"</c>, <c>"1 Transfer"</c>, <c>"2 Transfers"</c>, etc.
    /// </summary>
    [JsonPropertyName("label")]
    public required string Label { get; init; }

    /// <summary>The full route detail including legs, distance, duration, and bounding box.</summary>
    [JsonPropertyName("route")]
    public required NavigateResponse Route { get; init; }
}