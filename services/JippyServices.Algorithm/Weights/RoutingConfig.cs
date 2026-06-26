// ReSharper disable MemberCanBePrivate.Global

namespace JippyServices.Algorithm.Weights;

/// <summary>
/// An immutable snapshot of routing parameters derived from <see cref="AlgorithmWeights"/>.
/// Created via <see cref="FromWeights"/> and optionally modified for a single request
/// via <see cref="WithOverrides"/>. Used throughout the graph builder and navigator to
/// avoid re-reading the live weights mid-request.
/// </summary>
internal sealed class RoutingConfig
{
    public double WalkPenaltyMultiplier { get; init; }
    public double WalkComfortMeters { get; init; }
    public double WalkEscalationRate { get; init; }
    public double TransitCostFactor { get; init; }
    public double TransferPenaltyMeters { get; init; }
    public double BoardingCostFactor { get; init; }
    public double ClosurePenaltyMultiplier { get; init; }
    public double MinTransitRideMeters { get; init; }
    public double TransferProximityMeters { get; init; }
    public double WalkOnlyThresholdMeters { get; init; }
    public double MaxTransitProximityMeters { get; init; }
    public double WalkSpeedKmh { get; init; }
    public double TricycleSpeedKmh { get; init; }
    public double JeepneySpeedKmh { get; init; }
    public double TricycleRideCostFactor { get; init; }
    public double StationWaitPenaltyMeters { get; init; }
    public double HailingWaitPenaltyMeters { get; init; }
    public double MidRouteTricyclePenaltyMeters { get; init; }
    public double ShortTricyclePenaltyMeters { get; init; }
    public double MaxTricycleStationWalkMeters { get; init; }
    public double MinTricycleRideMeters { get; init; }
    public double BacktrackPenaltyMultiplier { get; init; }
    public double TricycleDetourFactor { get; init; }
    public double WalkDetourFactor { get; init; }
    public double MaxDirectWalkInsteadOfHailMeters { get; init; }
    public double MaxTricycleRideToTransitMeters { get; init; }
    public double MaxBoundaryExitWalkMeters { get; init; }
    public double MaxRegionBoundaryMeters { get; init; }
    public double LongWalkThresholdMeters { get; init; }
    public double StationUnavailabilityThreshold { get; init; }
    public double StopProximityMeters { get; init; }
    public int MaxStartingRoutes { get; init; }
    public int MaxSuggestionsPerStartRoute { get; init; }
    public int MaxTransfersToShow { get; init; }
    public double TransferDiversityPenalty { get; init; }
    public int AccessCandidatesPerDirection { get; init; }
    public int MaxAccessQueries { get; init; }
    public int EgressCandidatesPerDirection { get; init; }
    public int MaxEgressQueries { get; init; }
    public double JeepneyBaseFare { get; init; }
    public double JeepneyBaseKm { get; init; }
    public double JeepneyFarePerKm { get; init; }
    public double TricycleFlatFare { get; init; }
    public double FareCostWeight { get; init; }

    /// <summary>
    /// Build a <see cref="RoutingConfig"/> from the current <see cref="AlgorithmWeights"/> by
    /// copying all fields. The result is independent of future weight updates.
    /// </summary>
    public static RoutingConfig FromWeights(AlgorithmWeights weights) => new()
    {
        WalkPenaltyMultiplier = weights.WalkPenaltyMultiplier,
        WalkComfortMeters = weights.WalkComfortMeters,
        WalkEscalationRate = weights.WalkEscalationRate,
        TransitCostFactor = weights.TransitCostFactor,
        TransferPenaltyMeters = weights.TransferPenaltyMeters,
        BoardingCostFactor = weights.BoardingCostFactor,
        ClosurePenaltyMultiplier = weights.ClosurePenaltyMultiplier,
        MinTransitRideMeters = weights.MinTransitRideMeters,
        TransferProximityMeters = weights.TransferProximityMeters,
        WalkOnlyThresholdMeters = weights.WalkOnlyThresholdMeters,
        MaxTransitProximityMeters = weights.MaxTransitProximityMeters,
        WalkSpeedKmh = weights.WalkSpeedKmh,
        TricycleSpeedKmh = weights.TricycleSpeedKmh,
        JeepneySpeedKmh = weights.JeepneySpeedKmh,
        TricycleRideCostFactor = weights.TricycleRideCostFactor,
        StationWaitPenaltyMeters = weights.StationWaitPenaltyMeters,
        HailingWaitPenaltyMeters = weights.HailingWaitPenaltyMeters,
        MidRouteTricyclePenaltyMeters = weights.MidRouteTricyclePenaltyMeters,
        ShortTricyclePenaltyMeters = weights.ShortTricyclePenaltyMeters,
        MaxTricycleStationWalkMeters = weights.MaxTricycleStationWalkMeters,
        MinTricycleRideMeters = weights.MinTricycleRideMeters,
        BacktrackPenaltyMultiplier = weights.BacktrackPenaltyMultiplier,
        TricycleDetourFactor = weights.TricycleDetourFactor,
        WalkDetourFactor = weights.WalkDetourFactor,
        MaxDirectWalkInsteadOfHailMeters = weights.MaxDirectWalkInsteadOfHailMeters,
        MaxTricycleRideToTransitMeters = weights.MaxTricycleRideToTransitMeters,
        MaxBoundaryExitWalkMeters = weights.MaxBoundaryExitWalkMeters,
        MaxRegionBoundaryMeters = weights.MaxRegionBoundaryMeters,
        LongWalkThresholdMeters = weights.LongWalkThresholdMeters,
        StationUnavailabilityThreshold = weights.StationUnavailabilityThreshold,
        StopProximityMeters = weights.StopProximityMeters,
        MaxStartingRoutes = weights.MaxStartingRoutes,
        MaxSuggestionsPerStartRoute = weights.MaxSuggestionsPerStartRoute,
        MaxTransfersToShow = weights.MaxTransfersToShow,
        TransferDiversityPenalty = weights.TransferDiversityPenalty,
        AccessCandidatesPerDirection = weights.AccessCandidatesPerDirection,
        MaxAccessQueries = weights.MaxAccessQueries,
        EgressCandidatesPerDirection = weights.EgressCandidatesPerDirection,
        MaxEgressQueries = weights.MaxEgressQueries,
        JeepneyBaseFare = weights.JeepneyBaseFare,
        JeepneyBaseKm = weights.JeepneyBaseKm,
        JeepneyFarePerKm = weights.JeepneyFarePerKm,
        TricycleFlatFare = weights.TricycleFlatFare,
        FareCostWeight = weights.FareCostWeight,
    };

    /// <summary>
    /// Return a new <see cref="RoutingConfig"/> with any non-null fields from
    /// <paramref name="overrides"/> substituted in. Fields that are <see langword="null"/>
    /// in the overrides retain their existing values from this instance.
    /// Returns the same instance unchanged when <paramref name="overrides"/> is <see langword="null"/>.
    /// </summary>
    /// <param name="overrides">Optional per-request parameter overrides from a simulation request.</param>
    public RoutingConfig WithOverrides(SimulationOverrides? overrides)
    {
        if (overrides == null) return this;

        return new RoutingConfig
        {
            WalkPenaltyMultiplier = overrides.WalkPenaltyMultiplier ?? WalkPenaltyMultiplier,
            WalkComfortMeters = overrides.WalkComfortMeters ?? WalkComfortMeters,
            WalkEscalationRate = overrides.WalkEscalationRate ?? WalkEscalationRate,
            TransitCostFactor = overrides.TransitCostFactor ?? TransitCostFactor,
            TransferPenaltyMeters = overrides.TransferPenaltyMeters ?? TransferPenaltyMeters,
            BoardingCostFactor = overrides.BoardingCostFactor ?? BoardingCostFactor,
            ClosurePenaltyMultiplier = overrides.ClosurePenaltyMultiplier ?? ClosurePenaltyMultiplier,
            MinTransitRideMeters = overrides.MinTransitRideMeters ?? MinTransitRideMeters,
            TransferProximityMeters = overrides.TransferProximityMeters ?? TransferProximityMeters,
            WalkOnlyThresholdMeters = overrides.WalkOnlyThresholdMeters ?? WalkOnlyThresholdMeters,
            MaxTransitProximityMeters = overrides.MaxTransitProximityMeters ?? MaxTransitProximityMeters,
            WalkSpeedKmh = overrides.WalkSpeedKmh ?? WalkSpeedKmh,
            TricycleSpeedKmh = overrides.TricycleSpeedKmh ?? TricycleSpeedKmh,
            JeepneySpeedKmh = overrides.JeepneySpeedKmh ?? JeepneySpeedKmh,
            TricycleRideCostFactor = overrides.TricycleRideCostFactor ?? TricycleRideCostFactor,
            StationWaitPenaltyMeters = overrides.StationWaitPenaltyMeters ?? StationWaitPenaltyMeters,
            HailingWaitPenaltyMeters = overrides.HailingWaitPenaltyMeters ?? HailingWaitPenaltyMeters,
            MidRouteTricyclePenaltyMeters = overrides.MidRouteTricyclePenaltyMeters ?? MidRouteTricyclePenaltyMeters,
            ShortTricyclePenaltyMeters = overrides.ShortTricyclePenaltyMeters ?? ShortTricyclePenaltyMeters,
            MaxTricycleStationWalkMeters = overrides.MaxTricycleStationWalkMeters ?? MaxTricycleStationWalkMeters,
            MinTricycleRideMeters = overrides.MinTricycleRideMeters ?? MinTricycleRideMeters,
            BacktrackPenaltyMultiplier = overrides.BacktrackPenaltyMultiplier ?? BacktrackPenaltyMultiplier,
            TricycleDetourFactor = overrides.TricycleDetourFactor ?? TricycleDetourFactor,
            WalkDetourFactor = overrides.WalkDetourFactor ?? WalkDetourFactor,
            MaxDirectWalkInsteadOfHailMeters = overrides.MaxDirectWalkInsteadOfHailMeters ?? MaxDirectWalkInsteadOfHailMeters,
            MaxTricycleRideToTransitMeters = overrides.MaxTricycleRideToTransitMeters ?? MaxTricycleRideToTransitMeters,
            MaxBoundaryExitWalkMeters = overrides.MaxBoundaryExitWalkMeters ?? MaxBoundaryExitWalkMeters,
            MaxRegionBoundaryMeters = overrides.MaxRegionBoundaryMeters ?? MaxRegionBoundaryMeters,
            LongWalkThresholdMeters = overrides.LongWalkThresholdMeters ?? LongWalkThresholdMeters,
            StationUnavailabilityThreshold = overrides.StationUnavailabilityThreshold ?? StationUnavailabilityThreshold,
            StopProximityMeters = overrides.StopProximityMeters ?? StopProximityMeters,
            MaxStartingRoutes = overrides.MaxStartingRoutes ?? MaxStartingRoutes,
            MaxSuggestionsPerStartRoute = overrides.MaxSuggestionsPerStartRoute ?? MaxSuggestionsPerStartRoute,
            MaxTransfersToShow = overrides.MaxTransfersToShow ?? MaxTransfersToShow,
            TransferDiversityPenalty = overrides.TransferDiversityPenalty ?? TransferDiversityPenalty,
            AccessCandidatesPerDirection = overrides.AccessCandidatesPerDirection ?? AccessCandidatesPerDirection,
            MaxAccessQueries = overrides.MaxAccessQueries ?? MaxAccessQueries,
            EgressCandidatesPerDirection = overrides.EgressCandidatesPerDirection ?? EgressCandidatesPerDirection,
            MaxEgressQueries = overrides.MaxEgressQueries ?? MaxEgressQueries,
            JeepneyBaseFare = overrides.JeepneyBaseFare ?? JeepneyBaseFare,
            JeepneyBaseKm = overrides.JeepneyBaseKm ?? JeepneyBaseKm,
            JeepneyFarePerKm = overrides.JeepneyFarePerKm ?? JeepneyFarePerKm,
            TricycleFlatFare = overrides.TricycleFlatFare ?? TricycleFlatFare,
            FareCostWeight = overrides.FareCostWeight ?? FareCostWeight,
        };
    }

    /// <summary>
    /// Project this config into a <see cref="WeightProfile"/> containing only the fields
    /// needed by <see cref="AStarPathfinder"/> and <see cref="GraphBuilder.BuildCostedAdjacency"/>.
    /// Does not include diversity/explorer-only fields, which are added separately by
    /// <see cref="NavigatorV2"/> during the multi-suggestion loop.
    /// </summary>
    public WeightProfile ToBaseProfile() => new()
    {
        WalkPenaltyMultiplier = WalkPenaltyMultiplier,
        WalkComfortMeters = WalkComfortMeters,
        WalkEscalationRate = WalkEscalationRate,
        TransitCostFactor = TransitCostFactor,
        TransferPenaltyMeters = TransferPenaltyMeters,
        BoardingCostFactor = BoardingCostFactor,
        ClosurePenaltyMultiplier = ClosurePenaltyMultiplier,
        MaxTransfers = MaxTransfersToShow,
    };
}
