using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Utilities;

/// <summary>
/// Static helpers for computing Philippine-peso transport fares used in A* cost
/// assignment and route response assembly.
/// </summary>
internal static class FareUtils
{
    /// <summary>
    /// Compute the metered jeepney fare in Philippine pesos for a single boarding leg.
    /// The fare is <see cref="RoutingConfig.JeepneyBaseFare"/> for the first
    /// <see cref="RoutingConfig.JeepneyBaseKm"/> kilometres, then
    /// <see cref="RoutingConfig.JeepneyFarePerKm"/> is added for each kilometre beyond
    /// that threshold. Each transfer to a new jeepney line starts a fresh base fare.
    /// Called once per assembled <see cref="Contracts.V2.Responses.LegType.Jeepney"/> leg.
    /// </summary>
    /// <param name="distanceMeters">Leg distance in metres.</param>
    /// <param name="cfg">Routing config supplying the fare tunables.</param>
    /// <returns>Estimated fare in Philippine pesos, rounded to two decimal places.</returns>
    public static double ComputeJeepneyFare(double distanceMeters, RoutingConfig cfg)
    {
        var km = distanceMeters / 1000.0;
        var fare = km <= cfg.JeepneyBaseKm
            ? cfg.JeepneyBaseFare
            : cfg.JeepneyBaseFare + (km - cfg.JeepneyBaseKm) * cfg.JeepneyFarePerKm;

        return Math.Round(fare * 100) / 100;
    }

    /// <summary>
    /// Convert a Philippine-peso fare amount into an equivalent A* edge cost in metres
    /// using <see cref="RoutingConfig.FareCostWeight"/>.
    /// </summary>
    /// <param name="farePhp">Fare amount in Philippine pesos.</param>
    /// <param name="cfg">Routing config supplying the conversion factor.</param>
    /// <returns>Equivalent cost in metres for A* search.</returns>
    public static double FareToCostMeters(double farePhp, RoutingConfig cfg)
        => farePhp * cfg.FareCostWeight;
}
