using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Distributed;

namespace JippyServices.Algorithm.Navigator.Clients;

// -------------------------------------------------------------------------
// GraphHopper pedestrian routing client
// Ported from lib/routing/graphhopper-walk.ts
// -------------------------------------------------------------------------

public sealed class GraphHopperClient(
    HttpClient http,
    IConfiguration config,
    IDistributedCache cache,
    ILogger<GraphHopperClient> logger)
{
    private readonly string _baseUrl = config["Services:Graphhopper"]
                                       ?? throw new InvalidOperationException("Services:Graphhopper not configured.");

    // Walk distance cache: same road network → long TTL
    private static readonly TimeSpan WalkDistanceTtl = TimeSpan.FromHours(6);
    // Walk route cache: geometry + maneuvers
    private static readonly TimeSpan WalkRouteTtl = TimeSpan.FromHours(6);
    // Round to 5 decimal places (~1.1m precision) for cache key stability
    private const int CoordPrecision = 5;

    private static string CoordKey(LatLng p) =>
        $"{Math.Round(p.Lat, CoordPrecision)},{Math.Round(p.Lng, CoordPrecision)}";


    /// <summary>
    /// Compute a full pedestrian walking route with polyline, distance, duration and maneuvers.
    /// Results are cached by coordinate pair.
    /// </summary>
    public async Task<WalkRouteResult> GetWalkRouteAsync(LatLng from, LatLng to)
    {
        var cacheKey = $"walk_route:{CoordKey(from)}:{CoordKey(to)}";

        try
        {
            var cached = await cache.GetAsync(cacheKey);
            if (cached is { Length: > 0 })
                return JsonSerializer.Deserialize<WalkRouteResult>(cached)!;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Redis read failed for walk route cache");
        }

        var result = await FetchWalkRouteAsync(from, to);

        try
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(result);
            await cache.SetAsync(cacheKey, bytes, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = WalkRouteTtl,
            });
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Redis write failed for walk route cache");
        }

        return result;
    }

    private async Task<WalkRouteResult> FetchWalkRouteAsync(LatLng from, LatLng to)
    {
        var url = $"{_baseUrl}/route?point={from.Lat},{from.Lng}&point={to.Lat},{to.Lng}" +
                  "&profile=foot&instructions=true&points_encoded=false&locale=en";

        var response = await http.GetAsync(url);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<GhResponse>();
        var paths = payload?.Paths;
        if (paths is not { Count: > 0 })
            throw new InvalidOperationException("GraphHopper returned no walk route paths.");

        var path = paths[0];

        // Convert [lng, lat] GeoJSON coordinates to [lat, lng] for our polyline encoder
        var coords = (path.Points?.Coordinates ?? [])
            .Select(c => new LatLng(c[1], c[0]))
            .ToList();

        // Map GraphHopper instructions to maneuver type codes matching the Valhalla convention.
        // idx 0 → type 1 (depart), sign 4 → type 4 (arrive), others → type 10 (turn).
        var maneuvers = (path.Instructions ?? [])
            .Select((instr, idx) =>
            {
                int type;
                if (idx == 0) type = 1;
                else if (instr.Sign == 4) type = 4;
                else type = 10;

                return new WalkManeuver
                {
                    Type = type,
                    InstructionText = instr.Text ?? "",
                    LengthKm = instr.Distance / 1000.0,
                    TimeSec = (int)Math.Round(instr.Time / 1000.0),
                };
            })
            .ToList();

        return new WalkRouteResult
        {
            Polyline = coords.Count >= 2 ? PolylineCodec.Encode(coords) : "",
            Distance = path.Distance,
            Duration = (int)Math.Round(path.Time / 1000.0),
            Maneuvers = maneuvers,
        };
    }

    /// <summary>
    /// Lightweight distance-only walk query. Returns double.PositiveInfinity on failure
    /// so the caller can skip unreachable candidates. Cached by coordinate pair.
    /// </summary>
    public async Task<double> GetWalkDistanceAsync(LatLng from, LatLng to)
    {
        var cacheKey = $"walk_dist:{CoordKey(from)}:{CoordKey(to)}";

        try
        {
            var cached = await cache.GetAsync(cacheKey);
            if (cached is { Length: > 0 })
            {
                var str = Encoding.UTF8.GetString(cached);
                if (double.TryParse(str, out var dist)) return dist;
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Redis read failed for walk distance cache");
        }

        var result = await FetchWalkDistanceAsync(from, to);

        // Cache all results including PositiveInfinity (unreachable = stable)
        try
        {
            var bytes = Encoding.UTF8.GetBytes(result.ToString("R"));
            await cache.SetAsync(cacheKey, bytes, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = WalkDistanceTtl,
            });
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Redis write failed for walk distance cache");
        }

        return result;
    }

    private async Task<double> FetchWalkDistanceAsync(LatLng from, LatLng to)
    {
        try
        {
            var url = $"{_baseUrl}/route?point={from.Lat},{from.Lng}&point={to.Lat},{to.Lng}" +
                      "&profile=foot&instructions=false&calc_points=false";

            var response = await http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return double.PositiveInfinity;

            var payload = await response.Content.ReadFromJsonAsync<GhResponse>();
            var paths = payload?.Paths;
            if (paths is not { Count: > 0 }) return double.PositiveInfinity;

            return paths[0].Distance;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "GraphHopper walk distance query failed");
            return double.PositiveInfinity;
        }
    }

    // -- GraphHopper JSON response shapes --

    private sealed class GhResponse
    {
        [JsonPropertyName("paths")]
        public List<GhPath>? Paths { get; set; }
    }

    private sealed class GhPath
    {
        [JsonPropertyName("distance")]
        public double Distance { get; set; }

        [JsonPropertyName("time")]
        public double Time { get; set; }

        [JsonPropertyName("points")]
        public GhPoints? Points { get; set; }

        [JsonPropertyName("instructions")]
        public List<GhInstruction>? Instructions { get; set; }
    }

    private sealed class GhPoints
    {
        [JsonPropertyName("coordinates")]
        public List<double[]>? Coordinates { get; set; }
    }

    private sealed class GhInstruction
    {
        [JsonPropertyName("text")]
        public string? Text { get; set; }

        [JsonPropertyName("sign")]
        public int Sign { get; set; }

        [JsonPropertyName("distance")]
        public double Distance { get; set; }

        [JsonPropertyName("time")]
        public double Time { get; set; }
    }
}
