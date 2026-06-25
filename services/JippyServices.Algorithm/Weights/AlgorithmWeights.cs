using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Weights;

/// <summary>
/// JSON-serializable algorithm tunables persisted to <c>data/weights.json</c> and exposed
/// via the <c>GET/PUT /weights</c> API. All fields have production-tested defaults.
/// Updated values take effect on the next route request after the transit cache is invalidated.
/// </summary>
internal sealed class AlgorithmWeights
{
    /// <summary>
    /// Multiplier applied to walk costs beyond <see cref="WalkComfortMeters"/>.
    /// Higher values make A* avoid long walks more aggressively.
    /// </summary>
    [JsonPropertyName("walkPenaltyMultiplier")]
    public double WalkPenaltyMultiplier { get; init; } = 2.0;

    /// <summary>
    /// Distance in metres below which walking is not additionally penalised.
    /// Short walks up to this threshold are treated as comfortable.
    /// </summary>
    [JsonPropertyName("walkComfortMeters")]
    public double WalkComfortMeters { get; init; } = 150;

    /// <summary>
    /// Rate at which the walk penalty escalates per metre beyond <see cref="WalkComfortMeters"/>.
    /// A higher value causes A* to prefer transit alternatives more strongly for longer walks.
    /// </summary>
    [JsonPropertyName("walkEscalationRate")]
    public double WalkEscalationRate { get; init; } = 0.008;

    /// <summary>
    /// Multiplier applied to transit edge distances when computing A* cost.
    /// Values below 1.0 make transit appear cheaper than walking of the same distance,
    /// encouraging A* to prefer transit paths.
    /// </summary>
    [JsonPropertyName("transitCostFactor")]
    public double TransitCostFactor { get; init; } = 0.5;

    /// <summary>
    /// Fixed penalty in metres added when transferring between two different jeepney routes.
    /// Increases the cost of multi-transfer routes to prefer direct options.
    /// </summary>
    [JsonPropertyName("transferPenaltyMeters")]
    public double TransferPenaltyMeters { get; init; } = 1000;

    /// <summary>
    /// Minimum jeepney segment length in metres. Segments shorter than this are discarded
    /// as trivially short transit rides that are better served by walking.
    /// </summary>
    [JsonPropertyName("minTransitRideMeters")]
    public double MinTransitRideMeters { get; init; } = 500;

    /// <summary>
    /// Cost multiplier applied to edges that intersect an active road closure polygon.
    /// A value of 5× makes closed-road edges appear five times more expensive.
    /// </summary>
    [JsonPropertyName("closurePenaltyMultiplier")]
    public double ClosurePenaltyMultiplier { get; init; } = 5.0;

    /// <summary>
    /// Maximum walk distance in metres between alighting and boarding nodes for a
    /// transfer edge to be created. Nodes farther apart are not connected.
    /// </summary>
    [JsonPropertyName("transferProximityMeters")]
    public double TransferProximityMeters { get; init; } = 100;

    /// <summary>
    /// Straight-line distance threshold in metres below which the navigator skips graph
    /// construction and returns a walk-only route immediately.
    /// </summary>
    [JsonPropertyName("walkOnlyThresholdMeters")]
    public double WalkOnlyThresholdMeters { get; init; } = 200;

    /// <summary>
    /// Maximum straight-line distance in metres from the origin or destination at which
    /// transit nodes are considered for access/egress walk queries.
    /// </summary>
    [JsonPropertyName("maxTransitProximityMeters")]
    public double MaxTransitProximityMeters { get; init; } = 5_000;

    /// <summary>Assumed average walking speed in km/h used to compute walk leg durations.</summary>
    [JsonPropertyName("walkSpeedKmh")]
    public double WalkSpeedKmh { get; init; } = 4.25;

    /// <summary>Assumed average tricycle speed in km/h used to compute tricycle leg durations and fallback distances.</summary>
    [JsonPropertyName("tricycleSpeedKmh")]
    public double TricycleSpeedKmh { get; init; } = 10;

    /// <summary>Assumed average jeepney speed in km/h used to compute jeepney leg durations.</summary>
    [JsonPropertyName("jeepneySpeedKmh")]
    public double JeepneySpeedKmh { get; init; } = 10;

    /// <summary>
    /// Multiplier applied to tricycle ride distances when computing A* cost.
    /// Lower values make tricycle rides appear cheaper, encouraging their use for short trips.
    /// </summary>
    [JsonPropertyName("tricycleRideCostFactor")]
    public double TricycleRideCostFactor { get; init; } = 0.3;

    /// <summary>
    /// Fixed wait penalty in metres added when boarding a tricycle from a station.
    /// Models the time spent walking to and waiting at a fixed station.
    /// </summary>
    [JsonPropertyName("stationWaitPenaltyMeters")]
    public double StationWaitPenaltyMeters { get; init; } = 350;

    /// <summary>
    /// Fixed wait penalty in metres added when hailing a tricycle from the roadside.
    /// Slightly higher than <see cref="StationWaitPenaltyMeters"/> to reflect less reliable availability.
    /// </summary>
    [JsonPropertyName("hailingWaitPenaltyMeters")]
    public double HailingWaitPenaltyMeters { get; init; } = 525;

    /// <summary>
    /// Extra cost added when hailing a tricycle from a mid-route jeepney alight
    /// point to a station, so jeepney-to-jeepney transfers are preferred.
    /// </summary>
    [JsonPropertyName("midRouteTricyclePenaltyMeters")]
    public double MidRouteTricyclePenaltyMeters { get; init; } = 3_500;

    /// <summary>
    /// Maximum walk distance in metres from the user's position to a tricycle station
    /// before the station is excluded from the graph. Stations farther than this are unreachable on foot.
    /// </summary>
    [JsonPropertyName("maxTricycleStationWalkMeters")]
    public double MaxTricycleStationWalkMeters { get; init; } = 1_000;

    /// <summary>
    /// Minimum tricycle ride length in metres. Tricycle edges shorter than this are pruned
    /// to avoid suggesting trivially short rides.
    /// </summary>
    [JsonPropertyName("minTricycleRideMeters")]
    public double MinTricycleRideMeters { get; init; } = 150;

    /// <summary>
    /// Cost multiplier applied to graph edges that travel in the direction opposite to
    /// the destination (backtracking). Discourages routes that temporarily move away
    /// from the destination before reaching it.
    /// </summary>
    [JsonPropertyName("backtrackPenaltyMultiplier")]
    public double BacktrackPenaltyMultiplier { get; init; } = 2.0;

    /// <summary>
    /// Fraction of a region's stations that must be outside their operating hours before
    /// the entire region is considered unavailable. Used to filter inactive tricycle regions
    /// during time-window checks.
    /// </summary>
    [JsonPropertyName("stationUnavailabilityThreshold")]
    public double StationUnavailabilityThreshold { get; init; } = 0.9;

    /// <summary>
    /// Maximum snap distance in metres from the route polyline boundary to a tricycle exit node.
    /// Points beyond this threshold are not connected as boundary exits.
    /// </summary>
    [JsonPropertyName("maxRegionBoundaryMeters")]
    public double MaxRegionBoundaryMeters { get; init; } = 300;

    /// <summary>
    /// Maximum acceptable ratio of OSRM routed distance to straight-line haversine distance
    /// for a tricycle leg. Edges with a higher detour ratio receive an additional penalty.
    /// </summary>
    [JsonPropertyName("tricycleDetourFactor")]
    public double TricycleDetourFactor { get; init; } = 1.2;

    /// <summary>
    /// Maximum acceptable ratio of OSRM routed distance to straight-line haversine distance
    /// for a walk leg. Higher values indicate more circuitous pedestrian paths.
    /// </summary>
    [JsonPropertyName("walkDetourFactor")]
    public double WalkDetourFactor { get; init; } = 1.5;

    /// <summary>
    /// Maximum straight-line distance in metres within which walking directly to the
    /// destination is preferred over hailing a tricycle. Prevents very short tricycle rides.
    /// </summary>
    [JsonPropertyName("maxDirectWalkInsteadOfHailMeters")]
    public double MaxDirectWalkInsteadOfHailMeters { get; init; } = 500;

    /// <summary>
    /// Walk leg distance threshold in metres above which a mid-route walk (between two transit legs)
    /// is considered too long and the suggestion is filtered out if a better option exists.
    /// </summary>
    [JsonPropertyName("longWalkThresholdMeters")]
    public double LongWalkThresholdMeters { get; init; } = 1_000;

    /// <summary>
    /// Maximum tricycle ride distance in metres when used as a first-mile connector
    /// to a jeepney boarding point. Longer tricycle rides to transit are excluded.
    /// </summary>
    [JsonPropertyName("maxTricycleRideToTransitMeters")]
    public double MaxTricycleRideToTransitMeters { get; init; } = 600;

    /// <summary>
    /// Maximum walk distance in metres from a tricycle region boundary exit node to
    /// a jeepney boarding point for a boundary exit edge to be created.
    /// </summary>
    [JsonPropertyName("maxBoundaryExitWalkMeters")]
    public double MaxBoundaryExitWalkMeters { get; init; } = 500;

    /// <summary>
    /// Scaling factor applied to the raw boarding cost (derived from fleet count) before
    /// adding it to the A* edge cost. Higher values make waiting for a jeepney more expensive.
    /// </summary>
    [JsonPropertyName("boardingCostFactor")]
    public double BoardingCostFactor { get; init; } = 0.5;

    /// <summary>
    /// Snap radius in metres around a boarding restriction zone polyline. Graph nodes
    /// within this distance of a restricted zone are added to the stop-restricted node set.
    /// </summary>
    [JsonPropertyName("stopProximityMeters")]
    public double StopProximityMeters { get; init; } = 30;

    /// <summary>
    /// Maximum number of distinct jeepney starting routes to enumerate suggestions for.
    /// Limits the breadth of the multi-suggestion search.
    /// </summary>
    [JsonPropertyName("maxStartingRoutes")]
    public int MaxStartingRoutes { get; init; } = 4;

    /// <summary>
    /// Maximum number of route suggestions generated per starting route during diversity iteration.
    /// Each iteration penalises already-used routes to surface alternative paths.
    /// </summary>
    [JsonPropertyName("maxSuggestionsPerStartRoute")]
    public int MaxSuggestionsPerStartRoute { get; init; } = 5;

    /// <summary>
    /// Maximum number of jeepney-to-jeepney transfers shown in the response.
    /// Suggestions requiring more transfers than this are discarded.
    /// </summary>
    [JsonPropertyName("maxTransfersToShow")]
    public int MaxTransfersToShow { get; init; } = 3;

    /// <summary>
    /// Additional cost in metres added to edges belonging to routes that were used
    /// in a previous diversity iteration, steering A* toward different second or third legs.
    /// </summary>
    [JsonPropertyName("transferDiversityPenalty")]
    public double TransferDiversityPenalty { get; init; } = 3.0;

    /// <summary>
    /// Number of candidate transit nodes per direction (GoingTo/GoingBack) considered
    /// for access walk queries. Larger values improve coverage at the cost of more OSRM calls.
    /// </summary>
    [JsonPropertyName("accessCandidatesPerDirection")]
    public int AccessCandidatesPerDirection { get; init; } = 128;

    /// <summary>
    /// Hard cap on the number of OSRM foot distance queries issued for access walk computation.
    /// Prevents excessive parallelism when many candidates are nearby.
    /// </summary>
    [JsonPropertyName("maxAccessQueries")]
    public int MaxAccessQueries { get; init; } = 128;

    /// <summary>
    /// Number of candidate transit nodes per direction considered for egress walk queries.
    /// </summary>
    [JsonPropertyName("egressCandidatesPerDirection")]
    public int EgressCandidatesPerDirection { get; init; } = 128;

    /// <summary>
    /// Hard cap on the number of OSRM foot distance queries issued for egress walk computation.
    /// </summary>
    [JsonPropertyName("maxEgressQueries")]
    public int MaxEgressQueries { get; init; } = 128;

    /// <summary>A pre-built instance using all default field values, used as the ultimate fallback.</summary>
    public static AlgorithmWeights Defaults { get; } = new();
}
