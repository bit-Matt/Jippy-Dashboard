using JippyServices.Algorithm.Api;
using JippyServices.Algorithm.Api.Request;
using Microsoft.Extensions.Caching.Distributed;
using System.Text;
using JippyServices.Algorithm.Navigator.Common.Types;

namespace JippyServices.Algorithm.Clients;

/// <summary>
/// Concrete implementation of <see cref="INominatimServiceClient"/>.
/// Wraps the Refit <see cref="INominatimClient"/> with a Redis read/write cache
/// keyed by coordinate rounded to 5 decimal places (~1 m precision).
/// Results are cached for 24 hours to minimise Nominatim API usage.
/// Falls back to a formatted coordinate string on API failure.
/// </summary>
internal sealed class NominatimServiceClient : INominatimServiceClient
{
    private readonly INominatimClient _client;
    private readonly IConfiguration _config;
    private readonly IDistributedCache _cache;
    private readonly ILogger<NominatimServiceClient> _logger;

    /// <summary>How long a geocode result is kept in Redis before expiry.</summary>
    private static readonly TimeSpan GeocodeTtl = TimeSpan.FromHours(24);

    /// <summary>Number of decimal places used when rounding coordinates for cache key generation (~1 m precision).</summary>
    private const int CoordPrecision = 5;

    /// <summary>Build the Redis cache key for a coordinate, rounded to <see cref="CoordPrecision"/> decimal places.</summary>
    private static string CoordKey(LatLng p) =>
        $"{Math.Round(p.Lat, CoordPrecision)},{Math.Round(p.Lng, CoordPrecision)}";

    /// <summary>Format a coordinate as a human-readable fallback string when no address is found.</summary>
    private static string FormatCoordinate(LatLng point)
        => $"({point.Lat:F5}, {point.Lng:F5})";

    public NominatimServiceClient(
        INominatimClient client,
        IConfiguration config,
        IDistributedCache cache,
        ILogger<NominatimServiceClient> logger)
    {
        _client = client;
        _config = config;
        _cache = cache;
        _logger = logger;
    }

    /// <inheritdoc/>
    public async Task<string> ReverseGeocodeAsync(LatLng point, CancellationToken ct = default)
    {
        var cacheKey = $"geocode:{CoordKey(point)}";
        
        try
        {
            var cached = await _cache.GetAsync(cacheKey);
            if (cached is { Length: > 0 })
                return Encoding.UTF8.GetString(cached);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Redis read failed for geocode cache");
        }

        // Request
        var requestOptions = new NominatimReverseQuery
        {
            Latitude = point.Lat,
            Longitude = point.Lng,
            Format = "jsonv2",
            Zoom = 18,
        };
        var response = await _client.ReverseAsync(requestOptions, ct);

        // Build a readable name from the most useful available fields
        var road = response.Address.Road;
        var suburb = response.Address.Suburb ?? response.Address.Neighbourhood;

        var result = (road, suburb) switch
        {
            (not null, not null) => $"{road}, {suburb}",
            (not null, null) => road,
            (null, not null) => suburb,
            _ => FormatCoordinate(point),
        };

        try
        {
            var bytes = Encoding.UTF8.GetBytes(result);
            await _cache.SetAsync(cacheKey, bytes, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = GeocodeTtl,
            }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Redis write failed for geocode cache");
        }

        return result;
    }
}
