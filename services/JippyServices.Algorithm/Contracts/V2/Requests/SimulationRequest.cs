using System.Text.Json.Serialization;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Contracts.V2.Requests;

/// <summary>
/// Request body for the <c>POST /navigate/v2/simulate</c> endpoint.
/// Extends the standard navigation request with optional weight overrides
/// so that callers can test routing behaviour without permanently changing
/// the live weights.
/// </summary>
internal sealed class SimulationRequest
{
    /// <summary>The trip origin coordinate.</summary>
    [JsonPropertyName("start")]
    public LatLngObject Start { get; init; } = null!;

    /// <summary>The trip destination coordinate.</summary>
    [JsonPropertyName("end")]
    public LatLngObject End { get; init; } = null!;

    /// <summary>
    /// Optional per-request weight overrides applied on top of the current live configuration.
    /// When <see langword="null"/>, the unmodified live weights are used.
    /// </summary>
    [JsonPropertyName("overrides")]
    public SimulationOverrides? Overrides { get; init; }
}
