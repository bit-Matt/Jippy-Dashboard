using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Navigator.Clients;

// -------------------------------------------------------------------------
// Valhalla routing client — used for tricycle ride segments.
// Tries pedestrian costing first (stays on local roads), then falls back
// to motorcycle, then straight-line estimate.
// Ported from lib/routing/valhalla-motorcycle.ts
// -------------------------------------------------------------------------

public sealed class ValhallaClient(HttpClient http, IConfiguration config, ILogger<ValhallaClient> logger)
{
    private readonly string _baseUrl = config["Services:Valhalla"]
                                       ?? throw new InvalidOperationException("Services:Valhalla not configured.");

    /// <summary>Maximum ratio of route distance to haversine before rejecting.</summary>
    private const double MaxRouteDetourRatio = 2.5;

    /// <summary>
    /// Compute a tricycle route. Tries pedestrian, then motorcycle costing.
    /// Falls back to straight-line estimate if both fail or detour too much.
    /// </summary>
    public async Task<TricycleRouteResult> GetTricycleRouteAsync(LatLng from, LatLng to)
    {
        var straight = GeoUtils.HaversineMeters(from, to);
        string[] costings = ["pedestrian", "motorcycle"];

        foreach (var costing in costings)
        {
            try
            {
                var result = await FetchValhallaRouteAsync(from, to, costing);
                // Reject routes that detour excessively — they likely leave the region
                if (result.Distance > straight * MaxRouteDetourRatio) continue;
                return result;
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Valhalla {Costing} route failed, trying next", costing);
            }
        }

        // All costings failed — return straight-line estimate
        return new TricycleRouteResult
        {
            Polyline = PolylineCodec.Encode([from, to]),
            Distance = straight * 1.2,
            Duration = (int)Math.Round(straight * 1.2 / GeoUtils.SpeedMps(RoutingConstants.TricycleSpeedKmh)),
        };
    }

    private async Task<TricycleRouteResult> FetchValhallaRouteAsync(
        LatLng from, LatLng to, string costing)
    {
        var url = $"{_baseUrl}/route";
        var body = new
        {
            costing,
            locations = new[]
            {
                new { lat = from.Lat, lon = from.Lng, type = "break" },
                new { lat = to.Lat, lon = to.Lng, type = "break" },
            }
        };

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var response = await http.PostAsJsonAsync(url, body, cts.Token);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<VhResponse>(cts.Token);
        var legs = payload?.Trip?.Legs;
        if (legs is not { Count: > 0 })
            throw new InvalidOperationException($"Valhalla {costing} response has no route legs.");

        var mergedCoords = new List<LatLng>();
        double totalDistance = 0;
        double totalDuration = 0;

        foreach (var leg in legs)
        {
            if (leg.Summary != null)
            {
                totalDistance += leg.Summary.Length * 1000; // km → m
                totalDuration += leg.Summary.Time;
            }

            if (string.IsNullOrEmpty(leg.Shape)) continue;
            // Valhalla polylines use precision 1e6 — same as our PolylineCodec
            var coords = PolylineCodec.Decode(leg.Shape);
            if (coords.Count == 0) continue;

            if (mergedCoords.Count == 0)
                mergedCoords.AddRange(coords);
            else
                mergedCoords.AddRange(coords.Skip(1));
        }

        // Fallback to trip-level summary if leg summaries were missing
        if (totalDistance == 0 && payload?.Trip?.Summary != null)
        {
            totalDistance = payload.Trip.Summary.Length * 1000;
            totalDuration = payload.Trip.Summary.Time;
        }

        // Scale duration to tricycle speed if using pedestrian costing
        // (Valhalla pedestrian ≈ 5 km/h, tricycles travel ≈ 10 km/h)
        if (costing == "pedestrian" && totalDuration > 0)
        {
            totalDuration = Math.Round(totalDistance / GeoUtils.SpeedMps(RoutingConstants.TricycleSpeedKmh));
        }

        return new TricycleRouteResult
        {
            Polyline = mergedCoords.Count >= 2 ? PolylineCodec.Encode(mergedCoords) : "",
            Distance = totalDistance,
            Duration = (int)Math.Round(totalDuration),
        };
    }

    // -- Valhalla JSON response shapes --

    private sealed class VhResponse
    {
        [JsonPropertyName("trip")]
        public VhTrip? Trip { get; set; }
    }

    private sealed class VhTrip
    {
        [JsonPropertyName("legs")]
        public List<VhLeg>? Legs { get; set; }

        [JsonPropertyName("summary")]
        public VhSummary? Summary { get; set; }
    }

    private sealed class VhLeg
    {
        [JsonPropertyName("shape")]
        public string? Shape { get; set; }

        [JsonPropertyName("summary")]
        public VhSummary? Summary { get; set; }
    }

    private sealed class VhSummary
    {
        [JsonPropertyName("length")]
        public double Length { get; set; }

        [JsonPropertyName("time")]
        public double Time { get; set; }
    }
}
