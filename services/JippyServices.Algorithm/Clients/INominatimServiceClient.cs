using JippyServices.Algorithm.Navigator.Common.Types;

namespace JippyServices.Algorithm.Clients;

/// <summary>
/// Domain-facing wrapper for the Nominatim reverse-geocoding service.
/// Handles caching and result formatting on top of the raw Refit client.
/// </summary>
internal interface INominatimServiceClient
{
    /// <summary>
    /// Reverse geocode a geographic coordinate to a human-readable place name.
    /// Results are cached in Redis for 24 hours to avoid redundant API calls.
    /// Falls back to a formatted coordinate string when Nominatim returns no usable address.
    /// </summary>
    /// <param name="point">The coordinate to look up (WGS-84).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>
    /// A short place description such as "Rizal Street, Poblacion", or "(lat, lng)" as a
    /// fallback when no road or suburb is available.
    /// </returns>
    public Task<string> ReverseGeocodeAsync(LatLng point, CancellationToken ct = default);
}
