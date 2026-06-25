// ReSharper disable UnusedAutoPropertyAccessor.Global

using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Weights;

/// <summary>
/// Optional weight/graph-builder overrides sent by the simulator.
/// All fields are nullable; omitted values fall back to the active routing config.
/// </summary>
internal sealed class SimulationOverrides
{
    // Weights & penalties
    [JsonPropertyName("walkPenaltyMultiplier")]
    public double? WalkPenaltyMultiplier { get; init; }
    [JsonPropertyName("walkComfortMeters")]
    public double? WalkComfortMeters { get; init; }
    [JsonPropertyName("walkEscalationRate")]
    public double? WalkEscalationRate { get; init; }
    [JsonPropertyName("transferPenaltyMeters")]
    public double? TransferPenaltyMeters { get; init; }
    [JsonPropertyName("closurePenaltyMultiplier")]
    public double? ClosurePenaltyMultiplier { get; init; }
    [JsonPropertyName("boardingCostFactor")]
    public double? BoardingCostFactor { get; init; }
    [JsonPropertyName("transferProximityMeters")]
    public double? TransferProximityMeters { get; init; }

    // Transit
    [JsonPropertyName("transitCostFactor")]
    public double? TransitCostFactor { get; init; }
    [JsonPropertyName("minTransitRideMeters")]
    public double? MinTransitRideMeters { get; init; }
    [JsonPropertyName("walkOnlyThresholdMeters")]
    public double? WalkOnlyThresholdMeters { get; init; }
    [JsonPropertyName("maxTransitProximityMeters")]
    public double? MaxTransitProximityMeters { get; init; }

    // Speeds
    [JsonPropertyName("walkSpeedKmh")]
    public double? WalkSpeedKmh { get; init; }
    [JsonPropertyName("tricycleSpeedKmh")]
    public double? TricycleSpeedKmh { get; init; }
    [JsonPropertyName("jeepneySpeedKmh")]
    public double? JeepneySpeedKmh { get; init; }

    // Tricycle
    [JsonPropertyName("tricycleRideCostFactor")]
    public double? TricycleRideCostFactor { get; init; }
    [JsonPropertyName("stationWaitPenaltyMeters")]
    public double? StationWaitPenaltyMeters { get; init; }
    [JsonPropertyName("hailingWaitPenaltyMeters")]
    public double? HailingWaitPenaltyMeters { get; init; }
    [JsonPropertyName("midRouteTricyclePenaltyMeters")]
    public double? MidRouteTricyclePenaltyMeters { get; init; }
    [JsonPropertyName("maxTricycleStationWalkMeters")]
    public double? MaxTricycleStationWalkMeters { get; init; }
    [JsonPropertyName("minTricycleRideMeters")]
    public double? MinTricycleRideMeters { get; init; }
    [JsonPropertyName("backtrackPenaltyMultiplier")]
    public double? BacktrackPenaltyMultiplier { get; init; }
    [JsonPropertyName("tricycleDetourFactor")]
    public double? TricycleDetourFactor { get; init; }
    [JsonPropertyName("walkDetourFactor")]
    public double? WalkDetourFactor { get; init; }
    [JsonPropertyName("maxDirectWalkInsteadOfHailMeters")]
    public double? MaxDirectWalkInsteadOfHailMeters { get; init; }
    [JsonPropertyName("maxTricycleRideToTransitMeters")]
    public double? MaxTricycleRideToTransitMeters { get; init; }
    [JsonPropertyName("maxBoundaryExitWalkMeters")]
    public double? MaxBoundaryExitWalkMeters { get; init; }
    [JsonPropertyName("maxRegionBoundaryMeters")]
    public double? MaxRegionBoundaryMeters { get; init; }
    [JsonPropertyName("longWalkThresholdMeters")]
    public double? LongWalkThresholdMeters { get; init; }
    [JsonPropertyName("stationUnavailabilityThreshold")]
    public double? StationUnavailabilityThreshold { get; init; }
    [JsonPropertyName("stopProximityMeters")]
    public double? StopProximityMeters { get; init; }

    // Transfer-based suggestion enumeration
    [JsonPropertyName("maxStartingRoutes")]
    public int? MaxStartingRoutes { get; init; }
    [JsonPropertyName("maxSuggestionsPerStartRoute")]
    public int? MaxSuggestionsPerStartRoute { get; init; }
    [JsonPropertyName("maxTransfersToShow")]
    public int? MaxTransfersToShow { get; init; }
    [JsonPropertyName("transferDiversityPenalty")]
    public double? TransferDiversityPenalty { get; init; }

    // Graph builder
    [JsonPropertyName("accessCandidatesPerDirection")]
    public int? AccessCandidatesPerDirection { get; init; }
    [JsonPropertyName("maxAccessQueries")]
    public int? MaxAccessQueries { get; init; }
    [JsonPropertyName("egressCandidatesPerDirection")]
    public int? EgressCandidatesPerDirection { get; init; }
    [JsonPropertyName("maxEgressQueries")]
    public int? MaxEgressQueries { get; init; }
}