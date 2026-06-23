using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Navigator;

/// <summary>
/// JSON-serializable algorithm tunables loaded from weights.json.
/// </summary>
public sealed class AlgorithmWeights
{
    // Walk cost parameters
    [JsonPropertyName("walkPenaltyMultiplier")]
    public double WalkPenaltyMultiplier { get; init; } = 2.0;

    [JsonPropertyName("walkComfortMeters")]
    public double WalkComfortMeters { get; init; } = 150;

    [JsonPropertyName("walkEscalationRate")]
    public double WalkEscalationRate { get; init; } = 0.008;

    // Transit parameters
    [JsonPropertyName("transitCostFactor")]
    public double TransitCostFactor { get; init; } = 0.5;

    [JsonPropertyName("transferPenaltyMeters")]
    public double TransferPenaltyMeters { get; init; } = 1000;

    [JsonPropertyName("minTransitRideMeters")]
    public double MinTransitRideMeters { get; init; } = 500;

    [JsonPropertyName("closurePenaltyMultiplier")]
    public double ClosurePenaltyMultiplier { get; init; } = 5.0;

    [JsonPropertyName("transferProximityMeters")]
    public double TransferProximityMeters { get; init; } = 100;

    // Distance thresholds
    [JsonPropertyName("walkOnlyThresholdMeters")]
    public double WalkOnlyThresholdMeters { get; init; } = 200;

    [JsonPropertyName("maxTransitProximityMeters")]
    public double MaxTransitProximityMeters { get; init; } = 5_000;

    // Speeds
    [JsonPropertyName("walkSpeedKmh")]
    public double WalkSpeedKmh { get; init; } = 4.25;

    [JsonPropertyName("tricycleSpeedKmh")]
    public double TricycleSpeedKmh { get; init; } = 10;

    [JsonPropertyName("jeepneySpeedKmh")]
    public double JeepneySpeedKmh { get; init; } = 10;

    // Tricycle parameters
    [JsonPropertyName("tricycleRideCostFactor")]
    public double TricycleRideCostFactor { get; init; } = 0.3;

    [JsonPropertyName("stationWaitPenaltyMeters")]
    public double StationWaitPenaltyMeters { get; init; } = 350;

    [JsonPropertyName("hailingWaitPenaltyMeters")]
    public double HailingWaitPenaltyMeters { get; init; } = 525;

    [JsonPropertyName("maxTricycleStationWalkMeters")]
    public double MaxTricycleStationWalkMeters { get; init; } = 1_000;

    [JsonPropertyName("minTricycleRideMeters")]
    public double MinTricycleRideMeters { get; init; } = 150;

    [JsonPropertyName("backtrackPenaltyMultiplier")]
    public double BacktrackPenaltyMultiplier { get; init; } = 2.0;

    [JsonPropertyName("stationUnavailabilityThreshold")]
    public double StationUnavailabilityThreshold { get; init; } = 0.9;

    [JsonPropertyName("maxRegionBoundaryMeters")]
    public double MaxRegionBoundaryMeters { get; init; } = 300;

    [JsonPropertyName("tricycleDetourFactor")]
    public double TricycleDetourFactor { get; init; } = 1.2;

    [JsonPropertyName("walkDetourFactor")]
    public double WalkDetourFactor { get; init; } = 1.5;

    [JsonPropertyName("maxDirectWalkInsteadOfHailMeters")]
    public double MaxDirectWalkInsteadOfHailMeters { get; init; } = 500;

    [JsonPropertyName("longWalkThresholdMeters")]
    public double LongWalkThresholdMeters { get; init; } = 1_000;

    [JsonPropertyName("maxTricycleRideToTransitMeters")]
    public double MaxTricycleRideToTransitMeters { get; init; } = 600;

    [JsonPropertyName("maxBoundaryExitWalkMeters")]
    public double MaxBoundaryExitWalkMeters { get; init; } = 500;

    // Boarding cost
    [JsonPropertyName("boardingCostFactor")]
    public double BoardingCostFactor { get; init; } = 0.5;

    // Stop zones
    [JsonPropertyName("stopProximityMeters")]
    public double StopProximityMeters { get; init; } = 30;

    // Transfer-based suggestion enumeration
    [JsonPropertyName("maxStartingRoutes")]
    public int MaxStartingRoutes { get; init; } = 4;

    [JsonPropertyName("maxSuggestionsPerStartRoute")]
    public int MaxSuggestionsPerStartRoute { get; init; } = 3;

    [JsonPropertyName("maxTransfersToShow")]
    public int MaxTransfersToShow { get; init; } = 3;

    [JsonPropertyName("transferDiversityPenalty")]
    public double TransferDiversityPenalty { get; init; } = 3.0;

    // Graph builder internals
    [JsonPropertyName("accessCandidatesPerDirection")]
    public int AccessCandidatesPerDirection { get; init; } = 128;

    [JsonPropertyName("maxAccessQueries")]
    public int MaxAccessQueries { get; init; } = 128;

    [JsonPropertyName("egressCandidatesPerDirection")]
    public int EgressCandidatesPerDirection { get; init; } = 128;

    [JsonPropertyName("maxEgressQueries")]
    public int MaxEgressQueries { get; init; } = 128;

    public static AlgorithmWeights Defaults { get; } = new();
}
