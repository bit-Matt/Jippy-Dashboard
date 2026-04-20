namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Routing algorithm tunable parameters — ported from lib/routing/constants.ts
// -------------------------------------------------------------------------

public static class RoutingConstants
{
    // -- Walk cost parameters ------------------------------------------------

    /// <summary>Multiplier applied to walking distance in cost calculations.</summary>
    public const double WalkPenaltyMultiplier = 2.0;

    /// <summary>Walking distance (meters) below which cost is linear; above this it escalates.</summary>
    public const double WalkComfortMeters = 150;

    /// <summary>Rate at which walk cost escalates beyond the comfort threshold.</summary>
    public const double WalkEscalationRate = 0.008;

    // -- Transit parameters --------------------------------------------------

    /// <summary>Cost multiplier for transit ride edges. Less than 1 = riding is cheaper than walking.</summary>
    public const double TransitCostFactor = 0.5;

    /// <summary>Flat penalty (meters-equivalent) for each vehicle transfer.</summary>
    public const double TransferPenaltyMeters = 120;

    /// <summary>Minimum transit ride distance (m) to justify boarding.</summary>
    public const double MinTransitRideMeters = 300;

    /// <summary>Multiplier applied to edges crossing a road closure polygon.</summary>
    public const double ClosurePenaltyMultiplier = 5.0;

    /// <summary>Max distance (m) between nodes of different routes for a transfer edge.</summary>
    public const double TransferProximityMeters = 100;

    // -- Distance thresholds -------------------------------------------------

    /// <summary>Straight-line A→B below this → return a pure walk route.</summary>
    public const double WalkOnlyThresholdMeters = 200;

    /// <summary>If nearest transit line/station exceeds this from A or B → walk only.</summary>
    public const double MaxTransitProximityMeters = 5_000;

    // -- Speeds --------------------------------------------------------------

    /// <summary>Average walking speed in km/h.</summary>
    public const double WalkSpeedKmh = 4.25;

    /// <summary>Average tricycle speed in km/h.</summary>
    public const double TricycleSpeedKmh = 10;

    /// <summary>Average jeepney speed in km/h.</summary>
    public const double JeepneySpeedKmh = 10;

    // -- Tricycle parameters -------------------------------------------------

    /// <summary>Cost factor for tricycle ride edges (cheaper than walking).</summary>
    public const double TricycleRideCostFactor = 0.3;

    /// <summary>Flat penalty (meters-equiv) for station wait time (~5 min at walk speed).</summary>
    public const double StationWaitPenaltyMeters = 350;

    /// <summary>Flat penalty (meters-equiv) for hailing wait (~7.5 min).</summary>
    public const double HailingWaitPenaltyMeters = 525;

    /// <summary>Max walk distance (m) to consider a tricycle station reachable.</summary>
    public const double MaxTricycleStationWalkMeters = 1_000;

    /// <summary>Minimum tricycle ride distance (m) to justify boarding.</summary>
    public const double MinTricycleRideMeters = 150;

    /// <summary>Multiplier on walk cost when walking away from destination to reach station.</summary>
    public const double BacktrackPenaltyMultiplier = 2.0;

    /// <summary>If this fraction or more of stations are unavailable, skip the region.</summary>
    public const double StationUnavailabilityThreshold = 0.9;

    /// <summary>Max distance (m) from destination to region boundary for a drop-off node.</summary>
    public const double MaxRegionBoundaryMeters = 300;

    /// <summary>Detour factor applied to haversine for estimating tricycle road distance.</summary>
    public const double TricycleDetourFactor = 1.2;

    /// <summary>Detour factor applied to haversine for estimating walking road distance.</summary>
    public const double WalkDetourFactor = 1.5;

    /// <summary>Skip tricycle hail edge if jeepney node is this close (m) to destination.</summary>
    public const double MaxDirectWalkInsteadOfHailMeters = 500;

    /// <summary>Filter out suggestions with a mid-route walk exceeding this (m).</summary>
    public const double LongWalkThresholdMeters = 1_000;

    /// <summary>Max haversine (m) for a station → jeepney-node tricycle edge.</summary>
    public const double MaxTricycleRideToTransitMeters = 600;

    /// <summary>Max walk distance (m) from boundary exit node to jeepney node.</summary>
    public const double MaxBoundaryExitWalkMeters = 500;

    // -- Boarding cost -------------------------------------------------------

    /// <summary>Multiplier for fleet-based boarding cost.</summary>
    public const double BoardingCostFactor = 0.25;

    // -- Stop zones ----------------------------------------------------------

    /// <summary>Max distance (m) from a graph node to a stop polyline to consider the node restricted.</summary>
    public const double StopProximityMeters = 30;

    // -- A* ------------------------------------------------------------------

    /// <summary>Maximum A* iterations before giving up.</summary>
    public const int MaxAStarIterations = 50_000;

    /// <summary>Virtual node ID for the user's start point.</summary>
    public const string VirtualStartId = "__start__";

    /// <summary>Virtual node ID for the user's destination.</summary>
    public const string VirtualEndId = "__end__";

    // -- Explorer profile ----------------------------------------------------

    /// <summary>Diversity penalty multiplier for the explorer route.</summary>
    public const double ExplorerDiversityPenalty = 5.0;

    /// <summary>Max vehicle transfers allowed in explorer route.</summary>
    public const int ExplorerMaxTransfers = 2;

    /// <summary>Max duration relative to fastest route for explorer.</summary>
    public const double ExplorerDurationCap = 1.5;

    // -- Graph builder internals ---------------------------------------------

    /// <summary>Max access candidates per route-direction group.</summary>
    public const int AccessCandidatesPerDirection = 16;

    /// <summary>Max total access GraphHopper queries.</summary>
    public const int MaxAccessQueries = 30;

    /// <summary>Max egress candidates per route-direction group.</summary>
    public const int EgressCandidatesPerDirection = 16;

    /// <summary>Max total egress GraphHopper queries.</summary>
    public const int MaxEgressQueries = 30;

    // -------------------------------------------------------------------------
    // Weight profile presets
    // -------------------------------------------------------------------------

    private static readonly WeightProfile BaseProfile = new()
    {
        WalkPenaltyMultiplier = RoutingConstants.WalkPenaltyMultiplier,
        WalkComfortMeters = RoutingConstants.WalkComfortMeters,
        WalkEscalationRate = RoutingConstants.WalkEscalationRate,
        TransitCostFactor = RoutingConstants.TransitCostFactor,
        TransferPenaltyMeters = RoutingConstants.TransferPenaltyMeters,
        BoardingCostFactor = RoutingConstants.BoardingCostFactor,
        ClosurePenaltyMultiplier = RoutingConstants.ClosurePenaltyMultiplier,
    };

    /// <summary>Fastest: default balanced weights.</summary>
    public static WeightProfile ProfileFastest => new()
    {
        WalkPenaltyMultiplier = BaseProfile.WalkPenaltyMultiplier,
        WalkComfortMeters = BaseProfile.WalkComfortMeters,
        WalkEscalationRate = BaseProfile.WalkEscalationRate,
        TransitCostFactor = BaseProfile.TransitCostFactor,
        TransferPenaltyMeters = BaseProfile.TransferPenaltyMeters,
        BoardingCostFactor = BaseProfile.BoardingCostFactor,
        ClosurePenaltyMultiplier = BaseProfile.ClosurePenaltyMultiplier,
    };

    /// <summary>Least Walking: high walk penalty forces transit/tricycle usage.</summary>
    public static WeightProfile ProfileLeastWalking => new()
    {
        WalkPenaltyMultiplier = 5.0,
        WalkComfortMeters = BaseProfile.WalkComfortMeters,
        WalkEscalationRate = 0.02,
        TransitCostFactor = BaseProfile.TransitCostFactor,
        TransferPenaltyMeters = BaseProfile.TransferPenaltyMeters,
        BoardingCostFactor = BaseProfile.BoardingCostFactor,
        ClosurePenaltyMultiplier = BaseProfile.ClosurePenaltyMultiplier,
    };

    /// <summary>Simplest: extremely high transfer penalty to prefer direct routes.</summary>
    public static WeightProfile ProfileSimplest => new()
    {
        WalkPenaltyMultiplier = BaseProfile.WalkPenaltyMultiplier,
        WalkComfortMeters = BaseProfile.WalkComfortMeters,
        WalkEscalationRate = BaseProfile.WalkEscalationRate,
        TransitCostFactor = BaseProfile.TransitCostFactor,
        TransferPenaltyMeters = 1800,
        BoardingCostFactor = BaseProfile.BoardingCostFactor,
        ClosurePenaltyMultiplier = BaseProfile.ClosurePenaltyMultiplier,
    };
}
