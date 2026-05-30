using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Distributed;

namespace JippyServices.Algorithm.Navigator.Clients;

// -------------------------------------------------------------------------
// Nominatim reverse-geocoding client.
// Ported from lib/routing/instruction-generator.ts (getRoadName helper)
// -------------------------------------------------------------------------

public sealed class NominatimClient(
    HttpClient http,
    IConfiguration config,
    IDistributedCache cache,
    ILogger<NominatimClient> logger)
{
    private readonly string _baseUrl = config["Services:Nominatim"]
                                       ?? throw new InvalidOperationException("Services:Nominatim not configured.");

    // Street names don't change — long TTL is safe
    private static readonly TimeSpan GeocodeTtl = TimeSpan.FromHours(24);
    private const int CoordPrecision = 5;

    private static string CoordKey(LatLng p) =>
        $"{Math.Round(p.Lat, CoordPrecision)},{Math.Round(p.Lng, CoordPrecision)}";

    /// <summary>
    /// Reverse-geocode a lat/lng to a human-readable place name.
    /// Falls back through road → suburb → coordinate string.
    /// Results are cached by rounded coordinates.
    /// </summary>
    public async Task<string> ReverseGeocodeAsync(LatLng point)
    {
        var cacheKey = $"geocode:{CoordKey(point)}";

        try
        {
            var cached = await cache.GetAsync(cacheKey);
            if (cached is { Length: > 0 })
                return Encoding.UTF8.GetString(cached);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Redis read failed for geocode cache");
        }

        var result = await FetchReverseGeocodeAsync(point);

        try
        {
            var bytes = Encoding.UTF8.GetBytes(result);
            await cache.SetAsync(cacheKey, bytes, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = GeocodeTtl,
            });
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Redis write failed for geocode cache");
        }

        return result;
    }

    private async Task<string> FetchReverseGeocodeAsync(LatLng point)
    {
        try
        {
            var url = $"{_baseUrl}/reverse?lat={point.Lat.ToString(CultureInfo.InvariantCulture)}" +
                      $"&lon={point.Lng.ToString(CultureInfo.InvariantCulture)}&format=json&zoom=18";

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            var response = await http.GetAsync(url, cts.Token);
            if (!response.IsSuccessStatusCode)
                return FormatCoordinate(point);

            var payload = await response.Content.ReadFromJsonAsync<NomResponse>(cts.Token);
            var addr = payload?.Address;
            if (addr == null) return FormatCoordinate(point);

            // Build a readable name from the most useful available fields
            var road = addr.Road;
            var suburb = addr.Suburb ?? addr.Neighbourhood;

            return (road, suburb) switch
            {
                (not null, not null) => $"{road}, {suburb}",
                (not null, null) => road,
                (null, not null) => suburb,
                _ => FormatCoordinate(point),
            };
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Nominatim reverse geocode failed");
            return FormatCoordinate(point);
        }
    }

    private static string FormatCoordinate(LatLng point)
        => $"({point.Lat:F5}, {point.Lng:F5})";

    // -- Nominatim JSON response shapes --

    private sealed class NomResponse
    {
        [JsonPropertyName("address")]
        public NomAddress? Address { get; set; }
    }

    private sealed class NomAddress
    {
        [JsonPropertyName("road")]
        public string? Road { get; set; }

        [JsonPropertyName("suburb")]
        public string? Suburb { get; set; }

        [JsonPropertyName("neighbourhood")]
        public string? Neighbourhood { get; set; }
    }
}
