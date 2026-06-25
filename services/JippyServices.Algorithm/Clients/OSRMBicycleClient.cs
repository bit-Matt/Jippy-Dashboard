using JippyServices.Algorithm.Api;
using JippyServices.Algorithm.Api.Request;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Polyline;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Clients;

/// <summary>
/// <see cref="IOSRMClient"/> implementation for tricycle routes, backed by an OSRM
/// <c>driving</c> profile instance. Falls back to a straight-line estimate (×1.2)
/// when the OSRM call fails or returns an implausibly circuitous route (detour ratio
/// exceeds <see cref="MaxRouteDetourRatio"/>). Results are not Redis-cached because
/// tricycle routes are typically short and highly variable.
/// </summary>
internal sealed class OSRMBicycleClient : IOSRMClient
{
    private readonly IOSRMApiClient _client;
    private readonly IWeightsManager _weights;
    private readonly ILogger<OSRMBicycleClient> _logger;

    /// <summary>
    /// Maximum acceptable ratio of OSRM routed distance to straight-line haversine distance.
    /// Routes exceeding this ratio are considered unreliable and trigger the straight-line fallback.
    /// </summary>
    private const double MaxRouteDetourRatio = 2.5;
    
    public OSRMBicycleClient([FromKeyedServices("bicycle")] IOSRMApiClient client, IWeightsManager weights, ILogger<OSRMBicycleClient> logger)
    {
        _client = client;
        _weights = weights;
        _logger = logger;
    }
    
    /// <summary>
    /// Request a routed tricycle path between two points using the OSRM <c>driving</c> profile.
    /// Returns a straight-line polyline (distance × 1.2) when OSRM fails or the returned
    /// route exceeds the detour ratio threshold.
    /// </summary>
    /// <inheritdoc/>
    public async Task<Route> RouteAsync(LatLng from, LatLng to, CancellationToken ct = default)
    {
        var straight = GeoUtils.HaversineMeters(from, to);
        
        try
        {
            var result = await RouteBicycleAsync(from, to, ct);
            if (result.Distance <= straight * MaxRouteDetourRatio)
                return result;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "OSRM bicycle route failed");
        }
        
        return new Route
        {
            Polyline = PolylineCodec.Encode([from, to]),
            Distance = straight * 1.2,
            Duration = (int)Math.Round(straight * 1.2 / GeoUtils.SpeedMps(_weights.Current.TricycleSpeedKmh)),
        };
    }

    /// <summary>
    /// Return the routed tricycle distance in metres between two points.
    /// Falls back to a haversine estimate (× 1.2) on OSRM failure.
    /// </summary>
    /// <inheritdoc/>
    public async Task<double> DistanceAsync(LatLng from, LatLng to, CancellationToken ct = default)
    {
        try
        {
            var result = await RouteBicycleAsync(from, to, ct);
            return result.Distance;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "OSRM bicycle distance query failed; falling back to haversine estimate");
            return GeoUtils.HaversineMeters(from, to) * 1.2;
        }
    }

    /// <summary>
    /// Call the OSRM <c>driving</c> profile to get the routed path between two points.
    /// Requests a full polyline6 overview without turn-by-turn steps.
    /// Throws on non-OK responses or insufficient geometry.
    /// </summary>
    private async Task<Route> RouteBicycleAsync(LatLng from, LatLng to, CancellationToken ct = default)
    {
        var coordinates = $"{from.Lng},{from.Lat};{to.Lng},{to.Lat}";
        var query = new OSRMRoutingQuery
        {
            Overview = "full",
            Geometries = "polyline6",
            Steps = false,
        };

        var response = await _client.RouteAsync("driving", coordinates, query, ct);
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

        return new Route
        {
            Polyline = PolylineCodec.Encode(coords),
            Distance = route.Distance ?? 0,
            Duration = (int)Math.Round(route.Duration ?? 0),
        };
    }
}
