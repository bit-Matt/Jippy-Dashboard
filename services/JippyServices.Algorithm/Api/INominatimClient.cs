using JippyServices.Algorithm.Api.Request;
using JippyServices.Algorithm.Api.Responses;
using Refit;

namespace JippyServices.Algorithm.Api;

/// <summary>
/// Refit HTTP interface for the Nominatim geocoding API.
/// Registered as a singleton via <c>AddRefitClient</c> in Program.cs.
/// </summary>
internal interface INominatimClient
{
    /// <summary>
    /// Call the Nominatim <c>/reverse</c> endpoint to look up a place by coordinates.
    /// </summary>
    /// <param name="query">Query parameters including latitude, longitude, format, and zoom level.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The Nominatim reverse-geocoding response, including the structured address.</returns>
    [Get("/reverse")]
    Task<NominatimResponse> ReverseAsync(NominatimReverseQuery query, CancellationToken ct);
}
