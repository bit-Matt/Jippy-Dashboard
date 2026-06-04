using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Distributed;

namespace JippyServices.Algorithm.Navigator.Clients;

// -------------------------------------------------------------------------
// OSRM foot routing client — pedestrian walking routes
// Ported from lib/routing/osrm-walk.ts
// -------------------------------------------------------------------------

public sealed class OsrmWalkClient(
    HttpClient http,
    IConfiguration config,
    IDistributedCache cache,
    ILogger<OsrmWalkClient> logger)
{
    private readonly string _baseUrl = config["Services:OSRM:Foot"]
                                       ?? throw new InvalidOperationException("Services:OSRM:Foot not configured.");

    private static readonly TimeSpan WalkDistanceTtl = TimeSpan.FromHours(6);
    private static readonly TimeSpan WalkRouteTtl = TimeSpan.FromHours(6);
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
        var coordinates = $"{from.Lng},{from.Lat};{to.Lng},{to.Lat}";
        var url = $"{_baseUrl.TrimEnd('/')}/route/v1/foot/{coordinates}" +
                  "?overview=full&geometries=polyline6&steps=true";

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var response = await http.GetAsync(url, cts.Token);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<OsrmRouteResponse>(cts.Token);
        var route = payload?.Routes?.FirstOrDefault();
        if (route?.Geometry == null)
            throw new InvalidOperationException(payload?.Message ?? "OSRM foot response has no route geometry.");

        var coords = PolylineCodec.Decode(route.Geometry);
        if (coords.Count < 2)
            throw new InvalidOperationException("OSRM foot returned insufficient route coordinates.");

        var steps = route.Legs?.FirstOrDefault()?.Steps ?? [];
        var maneuvers = steps.Select(step => new WalkManeuver
        {
            Type = ManeuverTypeCode(step.Maneuver?.Type),
            InstructionText = FormatStepInstruction(step),
            LengthKm = (step.Distance ?? 0) / 1000.0,
            TimeSec = (int)Math.Round(step.Duration ?? 0),
        }).ToList();

        return new WalkRouteResult
        {
            Polyline = PolylineCodec.Encode(coords),
            Distance = route.Distance ?? 0,
            Duration = (int)Math.Round(route.Duration ?? 0),
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
            var coordinates = $"{from.Lng},{from.Lat};{to.Lng},{to.Lat}";
            var url = $"{_baseUrl.TrimEnd('/')}/route/v1/foot/{coordinates}" +
                      "?overview=false&steps=false";

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var response = await http.GetAsync(url, cts.Token);
            if (!response.IsSuccessStatusCode) return double.PositiveInfinity;

            var payload = await response.Content.ReadFromJsonAsync<OsrmRouteResponse>(cts.Token);
            var route = payload?.Routes?.FirstOrDefault();
            if (route == null) return double.PositiveInfinity;

            return route.Distance ?? double.PositiveInfinity;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "OSRM foot walk distance query failed");
            return double.PositiveInfinity;
        }
    }

    private static int ManeuverTypeCode(string? type) => type switch
    {
        "depart" => 1,
        "arrive" => 4,
        _ => 10,
    };

    private static string FormatStepInstruction(OsrmStep step)
    {
        var maneuver = step.Maneuver;
        var type = maneuver?.Type ?? "continue";
        var modifier = maneuver?.Modifier;
        var name = step.Name;

        if (type == "depart")
            return !string.IsNullOrEmpty(name)
                ? $"Head {modifier ?? "on"} {name}"
                : "Head toward destination";

        if (type == "arrive")
            return "You have arrived at your destination";

        var parts = new List<string>();
        if (!string.IsNullOrEmpty(modifier)) parts.Add(modifier);
        parts.Add(type);
        if (!string.IsNullOrEmpty(name)) parts.Add($"onto {name}");

        var text = string.Join(" ", parts);
        if (string.IsNullOrEmpty(text)) return "Continue";
        return char.ToUpper(text[0]) + text[1..];
    }

    // -- OSRM JSON response shapes --

    private sealed class OsrmRouteResponse
    {
        [JsonPropertyName("routes")]
        public List<OsrmRoute>? Routes { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    private sealed class OsrmRoute
    {
        [JsonPropertyName("geometry")]
        public string? Geometry { get; set; }

        [JsonPropertyName("distance")]
        public double? Distance { get; set; }

        [JsonPropertyName("duration")]
        public double? Duration { get; set; }

        [JsonPropertyName("legs")]
        public List<OsrmLeg>? Legs { get; set; }
    }

    private sealed class OsrmLeg
    {
        [JsonPropertyName("steps")]
        public List<OsrmStep>? Steps { get; set; }
    }

    private sealed class OsrmStep
    {
        [JsonPropertyName("distance")]
        public double? Distance { get; set; }

        [JsonPropertyName("duration")]
        public double? Duration { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("maneuver")]
        public OsrmManeuver? Maneuver { get; set; }
    }

    private sealed class OsrmManeuver
    {
        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("modifier")]
        public string? Modifier { get; set; }
    }
}
