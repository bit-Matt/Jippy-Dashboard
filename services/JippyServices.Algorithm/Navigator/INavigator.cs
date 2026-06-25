using JippyServices.Algorithm.Contracts.V2.Responses;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Navigator;

/// <summary>
/// Computes multi-modal transit routes between two geographic points.
/// Each implementation represents a versioned routing strategy.
/// </summary>
internal interface INavigator
{
    /// <summary>
    /// Compute one or more ranked route suggestions from <paramref name="start"/> to <paramref name="end"/>.
    /// Falls back to a walk-only route when the distance is below the configured threshold
    /// or when no transit graph can be built.
    /// </summary>
    /// <param name="start">Origin coordinate (WGS-84).</param>
    /// <param name="end">Destination coordinate (WGS-84).</param>
    /// <param name="config">
    /// Routing configuration that controls weights, thresholds, and transfer limits.
    /// When <see langword="null"/>, the current live configuration from <see cref="IWeightsManager"/> is used.
    /// </param>
    /// <returns>A response containing one or more ranked <see cref="RouteSuggestion"/> objects.</returns>
    public Task<MultiNavigateResponse> ComputeRouteAsync(LatLng start, LatLng end, RoutingConfig? config = null);
}
