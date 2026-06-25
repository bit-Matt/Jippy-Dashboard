using System.Text.Json.Serialization;
using JippyServices.Algorithm.Navigator.V2;

namespace JippyServices.Algorithm.Contracts.V2.Responses;

/// <summary>
/// Top-level response returned by all <c>/navigate</c> endpoints.
/// Contains an ordered list of route suggestions ranked by transfer count,
/// then walk distance, then total duration.
/// </summary>
internal sealed class MultiNavigateResponse
{
    /// <summary>
    /// Ranked route suggestions. Always contains at least one entry (the walk-only fallback).
    /// </summary>
    [JsonPropertyName("suggestions")]
    public required List<RouteSuggestion> Suggestions { get; init; }
}