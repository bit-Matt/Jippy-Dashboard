using System.Text;
using System.Text.Json;
using JippyServices.Algorithm.Api;
using JippyServices.Algorithm.Api.Request;
using JippyServices.Algorithm.Api.Responses;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Polyline;
using Microsoft.Extensions.Caching.Distributed;

namespace JippyServices.Algorithm.Clients;

/// <summary>
/// <see cref="IOSRMClient"/> implementation for pedestrian routes, backed by an OSRM
/// <c>foot</c> profile instance. Both <see cref="RouteAsync"/> and <see cref="DistanceAsync"/>
/// are Redis-cached for 6 hours, keyed by origin and destination coordinates rounded to
/// 5 decimal places (~1 m precision). Includes turn-by-turn step generation and manoeuvre
/// formatting for walk instructions.
/// </summary>
internal sealed class OSRMWalkClient : IOSRMClient
{
    private readonly IOSRMApiClient _client;
    private readonly IDistributedCache _cache;
    private readonly ILogger<OSRMWalkClient> _logger;

    /// <summary>How long a cached walk route is kept in Redis before expiry.</summary>
    private static readonly TimeSpan WalkDistanceTtl = TimeSpan.FromHours(6);

    /// <summary>How long a cached walk distance value is kept in Redis before expiry.</summary>
    private static readonly TimeSpan WalkRouteTtl = TimeSpan.FromHours(6);

    /// <summary>Number of decimal places used when rounding coordinates for cache key generation.</summary>
    private const int CoordPrecision = 5;

    /// <summary>Build the Redis cache key segment for a single coordinate.</summary>
    private static string CoordKey(LatLng p) =>
        $"{Math.Round(p.Lat, CoordPrecision)},{Math.Round(p.Lng, CoordPrecision)}";

    public OSRMWalkClient([FromKeyedServices("foot")] IOSRMApiClient client, IDistributedCache cache, ILogger<OSRMWalkClient> logger)
    {
        _client = client;
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Return a full walk route between two points, including polyline and turn-by-turn manoeuvres.
    /// Results are Redis-cached for 6 hours. On cache miss, calls the OSRM <c>foot</c> profile
    /// with <c>geometries=polyline6</c> and <c>steps=true</c>.
    /// </summary>
    /// <inheritdoc/>
    public async Task<Route> RouteAsync(LatLng from, LatLng to, CancellationToken ct = default)
    {
        var cacheKey = $"walk_route:{CoordKey(from)}:{CoordKey(to)}";
        
        try
        {
            var cached = await _cache.GetAsync(cacheKey, ct);
            if (cached is { Length: > 0 })
                return JsonSerializer.Deserialize<Route>(cached)!;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Redis read failed for walk route cache");
        }
        
        var result = await RouteWalkAsync(from, to, ct);
        
        try
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(result);
            await _cache.SetAsync(cacheKey, bytes, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = WalkRouteTtl,
            }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Redis write failed for walk route cache");
        }

        return result;
    }
    
    /// <summary>
    /// Return only the routed walk distance in metres between two points.
    /// Results are Redis-cached for 6 hours. On cache miss, calls the OSRM <c>foot</c> profile
    /// with <c>overview=false</c> to minimise payload. Returns <see cref="double.PositiveInfinity"/>
    /// when the destination is unreachable or the OSRM call fails.
    /// </summary>
    /// <inheritdoc/>
    public async Task<double> DistanceAsync(LatLng from, LatLng to, CancellationToken ct = default)
    {
        var cacheKey = $"walk_dist:{CoordKey(from)}:{CoordKey(to)}";

        try
        {
            var cached = await _cache.GetAsync(cacheKey, ct);
            if (cached is { Length: > 0 })
            {
                var str = Encoding.UTF8.GetString(cached);
                if (double.TryParse(str, out var dist)) return dist;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Redis read failed for walk distance cache");
        }

        var result = await FetchWalkDistanceAsync(from, to, ct);

        try
        {
            var bytes = Encoding.UTF8.GetBytes(result.ToString("R"));
            await _cache.SetAsync(cacheKey, bytes, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = WalkDistanceTtl,
            }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Redis write failed for walk distance cache");
        }

        return result;
    }
    
    /// <summary>
    /// Call OSRM to fetch the raw walk distance without geometry. Returns
    /// <see cref="double.PositiveInfinity"/> on non-OK response or exception.
    /// </summary>
    private async Task<double> FetchWalkDistanceAsync(LatLng from, LatLng to, CancellationToken ct = default)
    {
        try
        {
            var coordinates = $"{from.Lng},{from.Lat};{to.Lng},{to.Lat}";
            var query = new OSRMRoutingQuery
            {
                Overview = "false",
                Steps = "false",
            };
            
            var response = await _client.RouteAsync("foot", coordinates, query, ct);
            if (response.Code != "Ok")
            {
                return double.PositiveInfinity;
            }
            
            var route = response.Routes?.FirstOrDefault();
            if (route == null) return double.PositiveInfinity;
            
            return route.Distance ?? double.PositiveInfinity;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "OSRM foot walk distance query failed");
            return double.PositiveInfinity;
        }
    }

    /// <summary>
    /// Call OSRM <c>foot</c> with steps enabled and decode the resulting polyline6 geometry
    /// and step manoeuvres into a <see cref="Route"/>. Throws on non-OK response or
    /// insufficient geometry.
    /// </summary>
    private async Task<Route> RouteWalkAsync(LatLng from, LatLng to, CancellationToken ct)
    {
        var coordinates = $"{from.Lng},{from.Lat};{to.Lng},{to.Lat}";
        var query = new OSRMRoutingQuery
        {
            Overview = "full",
            Geometries = "polyline6",
            Steps = "true",
        };

        var response = await _client.RouteAsync("foot", coordinates, query, ct);
        if (response.Code != "Ok")
        {
            throw new InvalidOperationException(response.Message ?? "OSRM response returns an non-OK result.");
        }

        var route = response.Routes?.FirstOrDefault();
        if (route?.Geometry == null)
        {
            throw new InvalidOperationException("OSRM response has no route geometry.");
        }
        
        var coords = PolylineCodec.Decode(route.Geometry);
        if (coords.Count < 2)
        {
            throw new InvalidOperationException("OSRM returned insufficient route coordinates.");
        }
        
        var steps = route.Legs?.FirstOrDefault()?.Steps ?? [];
        var maneuvers = steps.Select(step => new Manuever
        {
            Type = ManeuverTypeCode(step.Maneuver?.Type),
            InstructionText = FormatStepInstruction(step),
            LengthKm = (step.Distance ?? 0) / 1000.0,
            TimeSec = (int)Math.Round(step.Duration ?? 0),
        }).ToList();

        return new Route
        {
            Polyline = PolylineCodec.Encode(coords),
            Distance = route.Distance ?? 0,
            Duration = (int)Math.Round(route.Duration ?? 0),
            Maneuvers = maneuvers,
        };
    }
    
    /// <summary>
    /// Map an OSRM manoeuvre type string to the integer code expected by the client model:
    /// 1 = depart, 4 = arrive, 10 = any other turn.
    /// </summary>
    private static int ManeuverTypeCode(string? type) => type switch
    {
        "depart" => 1,
        "arrive" => 4,
        _ => 10,
    };

    /// <summary>
    /// Build a human-readable instruction string from an OSRM step.
    /// Departure steps include the road name and departure direction; arrival steps use a
    /// fixed "arrived" string; all other steps combine the modifier, turn type, and road name.
    /// </summary>
    private static string FormatStepInstruction(Step step)
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
}
