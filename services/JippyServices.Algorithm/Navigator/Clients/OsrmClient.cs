using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Navigator.Clients;

// -------------------------------------------------------------------------
// OSRM bicycle routing client — used for tricycle ride segments.
// Calls OSRM /route/v1/driving with the bicycle base URL.
// Ported from lib/routing/osrm-motorcycle.ts
// -------------------------------------------------------------------------

public sealed class OsrmClient(HttpClient http, IConfiguration config, ILogger<OsrmClient> logger)
{
    private readonly string _bicycleUrl = config["Services:OSRM:Bicycle"]
                                          ?? throw new InvalidOperationException("Services:OSRM:Bicycle not configured.");

    /// <summary>Maximum ratio of route distance to haversine before falling back to straight-line.</summary>
    private const double MaxRouteDetourRatio = 2.5;

    /// <summary>
    /// Compute a tricycle route via OSRM bicycle profile.
    /// Falls back to a straight-line estimate if the route detours excessively or the request fails.
    /// </summary>
    public async Task<TricycleRouteResult> GetTricycleRouteAsync(LatLng from, LatLng to)
    {
        var straight = GeoUtils.HaversineMeters(from, to);

        try
        {
            var result = await FetchOsrmRouteAsync(_bicycleUrl, from, to);
            if (result.Distance <= straight * MaxRouteDetourRatio)
                return result;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "OSRM bicycle route failed");
        }

        // All attempts failed or detour was too high — return straight-line estimate
        return new TricycleRouteResult
        {
            Polyline = PolylineCodec.Encode([from, to]),
            Distance = straight * 1.2,
            Duration = (int)Math.Round(straight * 1.2 / GeoUtils.SpeedMps(RoutingConstants.TricycleSpeedKmh)),
        };
    }

    private async Task<TricycleRouteResult> FetchOsrmRouteAsync(string baseUrl, LatLng from, LatLng to)
    {
        // OSRM coordinate order is lng,lat
        var coordinates = $"{from.Lng},{from.Lat};{to.Lng},{to.Lat}";
        // Request polyline6 so the geometry matches our PolylineCodec precision (1,000,000)
        var url = $"{baseUrl.TrimEnd('/')}/route/v1/driving/{coordinates}" +
                  "?overview=full&geometries=polyline6&steps=false";

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var response = await http.GetAsync(url, cts.Token);

        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"OSRM route failed with status {(int)response.StatusCode}.");

        var payload = await response.Content.ReadFromJsonAsync<OsrmRouteResponse>(cts.Token);
        var route = payload?.Routes?.FirstOrDefault();
        if (route?.Geometry == null)
            throw new InvalidOperationException(payload?.Message ?? "OSRM response has no route geometry.");

        var coords = PolylineCodec.Decode(route.Geometry);
        if (coords.Count < 2)
            throw new InvalidOperationException("OSRM returned insufficient route coordinates.");

        return new TricycleRouteResult
        {
            Polyline = PolylineCodec.Encode(coords),
            Distance = route.Distance ?? 0,
            Duration = (int)Math.Round(route.Duration ?? 0),
        };
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
    }
}
