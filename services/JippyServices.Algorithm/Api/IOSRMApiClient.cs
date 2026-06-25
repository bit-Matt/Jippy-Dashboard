using JippyServices.Algorithm.Api.Request;
using JippyServices.Algorithm.Api.Responses;
using Refit;

namespace JippyServices.Algorithm.Api;

/// <summary>
/// Refit HTTP interface for the OSRM routing engine.
/// Two keyed instances are registered in Program.cs: <c>"bicycle"</c> for tricycle routes
/// and <c>"foot"</c> for pedestrian routes.
/// </summary>
internal interface IOSRMApiClient
{
    /// <summary>
    /// Call the OSRM <c>/route/v1</c> endpoint to compute a route for a given travel profile.
    /// </summary>
    /// <param name="profile">
    /// OSRM travel profile (e.g. <c>"foot"</c>, <c>"driving"</c>).
    /// This is embedded directly in the URL path.
    /// </param>
    /// <param name="coordinates">
    /// Semicolon-separated coordinate pairs in <c>lng,lat</c> order
    /// (e.g. <c>"124.001,8.484;124.012,8.491"</c>).
    /// </param>
    /// <param name="query">Optional routing parameters (geometry format, steps, overview, etc.).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The raw OSRM route response containing routes, legs, and step geometry.</returns>
    [Get("/route/v1/{profile}/{coordinates}")]
    Task<OSRMRouteResponse> RouteAsync(
        string profile,
        string coordinates,
        OSRMRoutingQuery query,
        CancellationToken ct = default);
}
