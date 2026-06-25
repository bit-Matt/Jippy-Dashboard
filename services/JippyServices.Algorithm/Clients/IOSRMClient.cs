using JippyServices.Algorithm.Navigator.Common.Types;

namespace JippyServices.Algorithm.Clients;

/// <summary>
/// Domain-facing client for an OSRM routing backend.
/// Concrete implementations wrap a specific travel profile (foot, bicycle/driving).
/// </summary>
internal interface IOSRMClient
{
    /// <summary>
    /// Request a full routed path between two points, including the encoded polyline,
    /// total distance in metres, duration in seconds, and turn-by-turn manoeuvres.
    /// </summary>
    /// <param name="from">Origin coordinate (WGS-84).</param>
    /// <param name="to">Destination coordinate (WGS-84).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A <see cref="Route"/> containing the polyline and trip metadata.</returns>
    public Task<Route> RouteAsync(LatLng from, LatLng to, CancellationToken ct = default);

    /// <summary>
    /// Return only the routed distance in metres between two points,
    /// without a full polyline. Used for lightweight access/egress cost queries.
    /// </summary>
    /// <param name="from">Origin coordinate (WGS-84).</param>
    /// <param name="to">Destination coordinate (WGS-84).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Road distance in metres, or <see cref="double.PositiveInfinity"/> when unreachable.</returns>
    public Task<double> DistanceAsync(LatLng from, LatLng to, CancellationToken ct = default);
}

/// <summary>
/// A single turn instruction produced by an OSRM routing response.
/// </summary>
internal sealed class Manuever
{
    /// <summary>OSRM manoeuvre type code (1 = depart, 4 = arrive, 10 = other).</summary>
    public required int Type { get; init; }

    /// <summary>Human-readable instruction text derived from the OSRM step.</summary>
    public required string InstructionText { get; init; }

    /// <summary>Distance of this step in kilometres.</summary>
    public required double LengthKm { get; init; }

    /// <summary>Estimated travel time for this step in seconds.</summary>
    public required int TimeSec { get; init; }
}

/// <summary>
/// The result of an OSRM routing call: an encoded polyline, trip distance/duration,
/// and optional turn-by-turn manoeuvres.
/// </summary>
internal sealed class Route
{
    /// <summary>Google-encoded polyline (precision 1e6) representing the full route geometry.</summary>
    public required string Polyline { get; init; }

    /// <summary>Total route distance in metres.</summary>
    public required double Distance { get; init; }

    /// <summary>Estimated travel duration in seconds.</summary>
    public required double Duration { get; init; }

    /// <summary>Ordered list of turn-by-turn instructions. Empty when steps were not requested.</summary>
    public List<Manuever> Maneuvers { get; init; } = [];
}
