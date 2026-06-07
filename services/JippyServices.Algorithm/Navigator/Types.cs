using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// All routing algorithm types — mirrors the TypeScript definitions in
// lib/routing/types.ts for full compatibility with the existing API contract.
// -------------------------------------------------------------------------

/// <summary>A latitude / longitude coordinate pair.</summary>
public readonly record struct LatLng(double Lat, double Lng);

/// <summary>Direction of travel on a jeepney route.</summary>
public enum RouteDirection { GoingTo, GoingBack }

/// <summary>
/// A node in the transit graph. Each node corresponds to one vertex of
/// a decoded polyline for a specific route and direction.
/// </summary>
public sealed class GraphNode
{
    public required string Id { get; init; }
    public required double Lat { get; init; }
    public required double Lng { get; init; }
    public required string RouteId { get; init; }
    public required string RouteName { get; init; }
    public required string RouteColor { get; init; }
    public required RouteDirection Direction { get; init; }
    public required int PolylineIndex { get; init; }
}

/// <summary>Type of edge in the transit graph.</summary>
public enum EdgeType { Transit, Transfer, Walk, Tricycle }

/// <summary>
/// A weighted, directed edge in the transit graph.
/// Cost is computed per weight-profile from the raw distance.
/// </summary>
public sealed class GraphEdge
{
    public required string From { get; init; }
    public required string To { get; init; }
    public required double Distance { get; init; }
    public required double Cost { get; set; }
    public required EdgeType Type { get; init; }
    public string? RouteId { get; init; }
    public string? RouteName { get; init; }

    // Tricycle-specific fields
    public string? StationId { get; init; }
    public string? StationName { get; init; }
    public LatLng? StationPoint { get; init; }
}

/// <summary>The full transit graph: nodes + adjacency list of edges.</summary>
public sealed class Graph
{
    public required Dictionary<string, GraphNode> Nodes { get; init; }
    public required Dictionary<string, List<GraphEdge>> Edges { get; init; }
}

// -------------------------------------------------------------------------
// Base-graph types — raw topology + distances, shared across profiles
// -------------------------------------------------------------------------

/// <summary>
/// A raw edge in the base graph — carries distance but no profile cost.
/// Enriched with metadata for tricycle, closure, and transfer edges.
/// </summary>
public sealed class BaseEdge
{
    public required string From { get; init; }
    public required string To { get; init; }
    public required double Distance { get; init; }
    public required EdgeType Type { get; init; }
    public string? RouteId { get; init; }
    public string? RouteName { get; init; }
    public double? TransferWalkDist { get; init; }
    public bool ClosureAffected { get; set; }
    public string? StationId { get; init; }
    public string? StationName { get; init; }
    public LatLng? StationPoint { get; init; }
    public string? RegionId { get; init; }
    public bool IsHail { get; init; }
    public double? WalkToStationDist { get; init; }
    public double? DetourRatio { get; init; }
}

/// <summary>
/// The reusable base graph. Built once per request, then applied to
/// multiple weight profiles without additional I/O.
/// </summary>
public sealed class BaseGraph
{
    public required Dictionary<string, GraphNode> Nodes { get; init; }
    public required Dictionary<string, List<BaseEdge>> BaseEdges { get; init; }
    public required Dictionary<string, double> RawBoardingCosts { get; init; }
    public required Dictionary<string, double> AccessWalkDistances { get; init; }
    public required Dictionary<string, double> EgressWalkDistances { get; init; }
    public required bool HasAccessEdges { get; init; }
    public required bool HasEgressEdges { get; init; }
    /// <summary>Node IDs where boarding, alighting, and transfers are forbidden by stop zones.</summary>
    public required HashSet<string> StopRestrictedNodes { get; init; }
}

// -------------------------------------------------------------------------
// Transit data loaded from the database
// -------------------------------------------------------------------------

public sealed class TransitRoute
{
    public required string Id { get; init; }
    public required string RouteNumber { get; init; }
    public required string RouteName { get; init; }
    public required string RouteColor { get; init; }
    public required int FleetCount { get; init; }
    public required string PolylineGoingTo { get; init; }
    public required string PolylineGoingBack { get; init; }
    public required List<LatLng> DecodedGoingTo { get; init; }
    public required List<LatLng> DecodedGoingBack { get; init; }
}

public sealed class TransitStation
{
    public required string Id { get; init; }
    public required string Address { get; init; }
    public required string AvailableFrom { get; init; }
    public required string AvailableTo { get; init; }
    public required LatLng Point { get; init; }
}

public sealed class TransitRegion
{
    public required string Id { get; init; }
    public required string RegionName { get; init; }
    public required string RegionColor { get; init; }
    public required string RegionShape { get; init; }
    public required List<RegionPoint> Points { get; init; }
    public required List<TransitStation> Stations { get; init; }
}

public sealed class RegionPoint
{
    public required string Id { get; init; }
    public required int Sequence { get; init; }
    public required LatLng Point { get; init; }
}

public sealed class TransitClosure
{
    public required string Id { get; init; }
    public required string ClosureName { get; init; }
    public required List<RegionPoint> Points { get; init; }
}

/// <summary>Restriction scope for a stop zone.</summary>
public enum RestrictionType
{
    Universal,  // all routes
    Specific,   // only listed route IDs
}

/// <summary>Direction(s) in which a stop zone restricts boarding/alighting.</summary>
public enum DisallowedDirection
{
    DirectionTo,
    DirectionBack,
    Both,
}

/// <summary>
/// A no-boarding / no-alighting zone defined by a decoded polyline.
/// Graph nodes within StopProximityMeters of this line are restricted.
/// </summary>
public sealed class TransitStop
{
    public required string Id { get; init; }
    public required RestrictionType RestrictionType { get; init; }
    public required DisallowedDirection DisallowedDirection { get; init; }
    /// <summary>Decoded polyline coordinates [lat, lng] defining the stop zone.</summary>
    public required List<LatLng> DecodedPolyline { get; init; }
    /// <summary>Route IDs that are restricted (only used when RestrictionType is Specific).</summary>
    public required List<string> RouteIds { get; init; }
}

public sealed class TransitData
{
    public required List<TransitRoute> Routes { get; init; }
    public required List<TransitRegion> Regions { get; init; }
    public required List<TransitClosure> Closures { get; init; }
    public required List<TransitStop> Stops { get; init; }
}

// -------------------------------------------------------------------------
// Weight profile for multi-suggestion routing
// -------------------------------------------------------------------------

public sealed class WeightProfile
{
    public required double WalkPenaltyMultiplier { get; init; }
    public required double WalkComfortMeters { get; init; }
    public required double WalkEscalationRate { get; init; }
    public required double TransitCostFactor { get; init; }
    public required double TransferPenaltyMeters { get; init; }
    public required double BoardingCostFactor { get; init; }
    public required double ClosurePenaltyMultiplier { get; init; }

    // Explorer-only fields
    public HashSet<string>? PenalizedRouteIds { get; init; }
    public double? DiversityPenalty { get; init; }
    public int? MaxTransfers { get; init; }
}

// -------------------------------------------------------------------------
// Simulation overrides — optional runtime tunables from the dashboard
// -------------------------------------------------------------------------

/// <summary>
/// Optional weight/graph-builder overrides sent by the simulator.
/// All fields are nullable; omitted values fall back to <see cref="RoutingConstants"/>.
/// </summary>
public sealed class SimulationOverrides
{
    // Weights & penalties
    [JsonPropertyName("walkPenaltyMultiplier")] public double? WalkPenaltyMultiplier { get; init; }
    [JsonPropertyName("walkComfortMeters")] public double? WalkComfortMeters { get; init; }
    [JsonPropertyName("walkEscalationRate")] public double? WalkEscalationRate { get; init; }
    [JsonPropertyName("transferPenaltyMeters")] public double? TransferPenaltyMeters { get; init; }
    [JsonPropertyName("closurePenaltyMultiplier")] public double? ClosurePenaltyMultiplier { get; init; }
    [JsonPropertyName("boardingCostFactor")] public double? BoardingCostFactor { get; init; }

    // Transit
    [JsonPropertyName("transitCostFactor")] public double? TransitCostFactor { get; init; }
    [JsonPropertyName("minTransitRideMeters")] public double? MinTransitRideMeters { get; init; }

    // Tricycle
    [JsonPropertyName("tricycleRideCostFactor")] public double? TricycleRideCostFactor { get; init; }
    [JsonPropertyName("stationWaitPenaltyMeters")] public double? StationWaitPenaltyMeters { get; init; }
    [JsonPropertyName("hailingWaitPenaltyMeters")] public double? HailingWaitPenaltyMeters { get; init; }
    [JsonPropertyName("maxTricycleStationWalkMeters")] public double? MaxTricycleStationWalkMeters { get; init; }
    [JsonPropertyName("minTricycleRideMeters")] public double? MinTricycleRideMeters { get; init; }
    [JsonPropertyName("backtrackPenaltyMultiplier")] public double? BacktrackPenaltyMultiplier { get; init; }
    [JsonPropertyName("tricycleDetourFactor")] public double? TricycleDetourFactor { get; init; }
    [JsonPropertyName("walkDetourFactor")] public double? WalkDetourFactor { get; init; }
    [JsonPropertyName("maxDirectWalkInsteadOfHailMeters")] public double? MaxDirectWalkInsteadOfHailMeters { get; init; }
    [JsonPropertyName("maxTricycleRideToTransitMeters")] public double? MaxTricycleRideToTransitMeters { get; init; }
    [JsonPropertyName("maxBoundaryExitWalkMeters")] public double? MaxBoundaryExitWalkMeters { get; init; }
    [JsonPropertyName("maxRegionBoundaryMeters")] public double? MaxRegionBoundaryMeters { get; init; }

    // Profile
    [JsonPropertyName("explorerDiversityPenalty")] public double? ExplorerDiversityPenalty { get; init; }
    [JsonPropertyName("explorerMaxTransfers")] public int? ExplorerMaxTransfers { get; init; }
    [JsonPropertyName("explorerDurationCap")] public double? ExplorerDurationCap { get; init; }

    // Graph builder
    [JsonPropertyName("accessCandidatesPerDirection")] public int? AccessCandidatesPerDirection { get; init; }
    [JsonPropertyName("maxAccessQueries")] public int? MaxAccessQueries { get; init; }
    [JsonPropertyName("egressCandidatesPerDirection")] public int? EgressCandidatesPerDirection { get; init; }
    [JsonPropertyName("maxEgressQueries")] public int? MaxEgressQueries { get; init; }
}

/// <summary>
/// Resolved routing configuration with all tunables materialized from constants and overrides.
/// </summary>
public sealed class RoutingConfig
{
    public double WalkPenaltyMultiplier { get; init; }
    public double WalkComfortMeters { get; init; }
    public double WalkEscalationRate { get; init; }
    public double TransitCostFactor { get; init; }
    public double TransferPenaltyMeters { get; init; }
    public double BoardingCostFactor { get; init; }
    public double ClosurePenaltyMultiplier { get; init; }
    public double MinTransitRideMeters { get; init; }
    public double TricycleRideCostFactor { get; init; }
    public double StationWaitPenaltyMeters { get; init; }
    public double HailingWaitPenaltyMeters { get; init; }
    public double MaxTricycleStationWalkMeters { get; init; }
    public double MinTricycleRideMeters { get; init; }
    public double BacktrackPenaltyMultiplier { get; init; }
    public double TricycleDetourFactor { get; init; }
    public double WalkDetourFactor { get; init; }
    public double MaxDirectWalkInsteadOfHailMeters { get; init; }
    public double MaxTricycleRideToTransitMeters { get; init; }
    public double MaxBoundaryExitWalkMeters { get; init; }
    public double MaxRegionBoundaryMeters { get; init; }
    public double ExplorerDiversityPenalty { get; init; }
    public int ExplorerMaxTransfers { get; init; }
    public double ExplorerDurationCap { get; init; }
    public int AccessCandidatesPerDirection { get; init; }
    public int MaxAccessQueries { get; init; }
    public int EgressCandidatesPerDirection { get; init; }
    public int MaxEgressQueries { get; init; }

    public static RoutingConfig Default { get; } = new()
    {
        WalkPenaltyMultiplier = RoutingConstants.WalkPenaltyMultiplier,
        WalkComfortMeters = RoutingConstants.WalkComfortMeters,
        WalkEscalationRate = RoutingConstants.WalkEscalationRate,
        TransitCostFactor = RoutingConstants.TransitCostFactor,
        TransferPenaltyMeters = RoutingConstants.TransferPenaltyMeters,
        BoardingCostFactor = RoutingConstants.BoardingCostFactor,
        ClosurePenaltyMultiplier = RoutingConstants.ClosurePenaltyMultiplier,
        MinTransitRideMeters = RoutingConstants.MinTransitRideMeters,
        TricycleRideCostFactor = RoutingConstants.TricycleRideCostFactor,
        StationWaitPenaltyMeters = RoutingConstants.StationWaitPenaltyMeters,
        HailingWaitPenaltyMeters = RoutingConstants.HailingWaitPenaltyMeters,
        MaxTricycleStationWalkMeters = RoutingConstants.MaxTricycleStationWalkMeters,
        MinTricycleRideMeters = RoutingConstants.MinTricycleRideMeters,
        BacktrackPenaltyMultiplier = RoutingConstants.BacktrackPenaltyMultiplier,
        TricycleDetourFactor = RoutingConstants.TricycleDetourFactor,
        WalkDetourFactor = RoutingConstants.WalkDetourFactor,
        MaxDirectWalkInsteadOfHailMeters = RoutingConstants.MaxDirectWalkInsteadOfHailMeters,
        MaxTricycleRideToTransitMeters = RoutingConstants.MaxTricycleRideToTransitMeters,
        MaxBoundaryExitWalkMeters = RoutingConstants.MaxBoundaryExitWalkMeters,
        MaxRegionBoundaryMeters = RoutingConstants.MaxRegionBoundaryMeters,
        ExplorerDiversityPenalty = RoutingConstants.ExplorerDiversityPenalty,
        ExplorerMaxTransfers = RoutingConstants.ExplorerMaxTransfers,
        ExplorerDurationCap = RoutingConstants.ExplorerDurationCap,
        AccessCandidatesPerDirection = RoutingConstants.AccessCandidatesPerDirection,
        MaxAccessQueries = RoutingConstants.MaxAccessQueries,
        EgressCandidatesPerDirection = RoutingConstants.EgressCandidatesPerDirection,
        MaxEgressQueries = RoutingConstants.MaxEgressQueries,
    };

    public static RoutingConfig FromOverrides(SimulationOverrides? overrides)
    {
        if (overrides == null) return Default;

        return new RoutingConfig
        {
            WalkPenaltyMultiplier = overrides.WalkPenaltyMultiplier ?? RoutingConstants.WalkPenaltyMultiplier,
            WalkComfortMeters = overrides.WalkComfortMeters ?? RoutingConstants.WalkComfortMeters,
            WalkEscalationRate = overrides.WalkEscalationRate ?? RoutingConstants.WalkEscalationRate,
            TransitCostFactor = overrides.TransitCostFactor ?? RoutingConstants.TransitCostFactor,
            TransferPenaltyMeters = overrides.TransferPenaltyMeters ?? RoutingConstants.TransferPenaltyMeters,
            BoardingCostFactor = overrides.BoardingCostFactor ?? RoutingConstants.BoardingCostFactor,
            ClosurePenaltyMultiplier = overrides.ClosurePenaltyMultiplier ?? RoutingConstants.ClosurePenaltyMultiplier,
            MinTransitRideMeters = overrides.MinTransitRideMeters ?? RoutingConstants.MinTransitRideMeters,
            TricycleRideCostFactor = overrides.TricycleRideCostFactor ?? RoutingConstants.TricycleRideCostFactor,
            StationWaitPenaltyMeters = overrides.StationWaitPenaltyMeters ?? RoutingConstants.StationWaitPenaltyMeters,
            HailingWaitPenaltyMeters = overrides.HailingWaitPenaltyMeters ?? RoutingConstants.HailingWaitPenaltyMeters,
            MaxTricycleStationWalkMeters = overrides.MaxTricycleStationWalkMeters ?? RoutingConstants.MaxTricycleStationWalkMeters,
            MinTricycleRideMeters = overrides.MinTricycleRideMeters ?? RoutingConstants.MinTricycleRideMeters,
            BacktrackPenaltyMultiplier = overrides.BacktrackPenaltyMultiplier ?? RoutingConstants.BacktrackPenaltyMultiplier,
            TricycleDetourFactor = overrides.TricycleDetourFactor ?? RoutingConstants.TricycleDetourFactor,
            WalkDetourFactor = overrides.WalkDetourFactor ?? RoutingConstants.WalkDetourFactor,
            MaxDirectWalkInsteadOfHailMeters = overrides.MaxDirectWalkInsteadOfHailMeters ?? RoutingConstants.MaxDirectWalkInsteadOfHailMeters,
            MaxTricycleRideToTransitMeters = overrides.MaxTricycleRideToTransitMeters ?? RoutingConstants.MaxTricycleRideToTransitMeters,
            MaxBoundaryExitWalkMeters = overrides.MaxBoundaryExitWalkMeters ?? RoutingConstants.MaxBoundaryExitWalkMeters,
            MaxRegionBoundaryMeters = overrides.MaxRegionBoundaryMeters ?? RoutingConstants.MaxRegionBoundaryMeters,
            ExplorerDiversityPenalty = overrides.ExplorerDiversityPenalty ?? RoutingConstants.ExplorerDiversityPenalty,
            ExplorerMaxTransfers = overrides.ExplorerMaxTransfers ?? RoutingConstants.ExplorerMaxTransfers,
            ExplorerDurationCap = overrides.ExplorerDurationCap ?? RoutingConstants.ExplorerDurationCap,
            AccessCandidatesPerDirection = overrides.AccessCandidatesPerDirection ?? RoutingConstants.AccessCandidatesPerDirection,
            MaxAccessQueries = overrides.MaxAccessQueries ?? RoutingConstants.MaxAccessQueries,
            EgressCandidatesPerDirection = overrides.EgressCandidatesPerDirection ?? RoutingConstants.EgressCandidatesPerDirection,
            MaxEgressQueries = overrides.MaxEgressQueries ?? RoutingConstants.MaxEgressQueries,
        };
    }

    public WeightProfile ToFastestProfile() => new()
    {
        WalkPenaltyMultiplier = WalkPenaltyMultiplier,
        WalkComfortMeters = WalkComfortMeters,
        WalkEscalationRate = WalkEscalationRate,
        TransitCostFactor = TransitCostFactor,
        TransferPenaltyMeters = TransferPenaltyMeters,
        BoardingCostFactor = BoardingCostFactor,
        ClosurePenaltyMultiplier = ClosurePenaltyMultiplier,
    };

    public WeightProfile ToLeastWalkingProfile() => new()
    {
        WalkPenaltyMultiplier = WalkPenaltyMultiplier * 2.5,
        WalkComfortMeters = WalkComfortMeters,
        WalkEscalationRate = WalkEscalationRate * 2.5,
        TransitCostFactor = TransitCostFactor,
        TransferPenaltyMeters = TransferPenaltyMeters,
        BoardingCostFactor = BoardingCostFactor,
        ClosurePenaltyMultiplier = ClosurePenaltyMultiplier,
    };

    public WeightProfile ToSimplestProfile() => new()
    {
        WalkPenaltyMultiplier = WalkPenaltyMultiplier,
        WalkComfortMeters = WalkComfortMeters,
        WalkEscalationRate = WalkEscalationRate,
        TransitCostFactor = TransitCostFactor,
        TransferPenaltyMeters = TransferPenaltyMeters * 15,
        BoardingCostFactor = BoardingCostFactor,
        ClosurePenaltyMultiplier = ClosurePenaltyMultiplier,
    };
}

// -------------------------------------------------------------------------
// Path reconstruction types
// -------------------------------------------------------------------------

public sealed class PathSegment
{
    public required string RouteId { get; init; }
    public required RouteDirection Direction { get; init; }
    public required string RouteName { get; init; }
    public required string RouteColor { get; init; }
    public required List<GraphNode> Nodes { get; init; }
}

// Path section — discriminated via Type property
public abstract class PathSection
{
    public abstract string Type { get; }
}

public sealed class WalkSection : PathSection
{
    public override string Type => "walk";
    public required GraphNode FromNode { get; init; }
    public required GraphNode ToNode { get; init; }
}

public sealed class TricycleSection : PathSection
{
    public override string Type => "tricycle";
    public required GraphNode FromNode { get; init; }
    public required GraphNode ToNode { get; init; }
    public required GraphEdge Edge { get; init; }
}

public sealed class TransitSection : PathSection
{
    public override string Type => "transit";
    public required string RouteId { get; init; }
    public required string RouteName { get; init; }
    public required string RouteColor { get; init; }
    public required RouteDirection Direction { get; init; }
    public required List<GraphNode> Nodes { get; init; }
}

// -------------------------------------------------------------------------
// Instruction and leg types — JSON-serializable API response shapes
// -------------------------------------------------------------------------

[JsonConverter(typeof(JsonStringEnumConverter<ManeuverType>))]
public enum ManeuverType
{
    [JsonStringEnumMemberName("depart")] Depart,
    [JsonStringEnumMemberName("turn")] Turn,
    [JsonStringEnumMemberName("board")] Board,
    [JsonStringEnumMemberName("alight")] Alight,
    [JsonStringEnumMemberName("transfer")] Transfer,
    [JsonStringEnumMemberName("arrive")] Arrive,
}

public sealed class Instruction
{
    [JsonPropertyName("text")]
    public required string Text { get; init; }

    [JsonPropertyName("maneuver_type")]
    public required ManeuverType ManeuverType { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<LegType>))]
public enum LegType
{
    [JsonStringEnumMemberName("WALK")] Walk,
    [JsonStringEnumMemberName("TRICYCLE")] Tricycle,
    [JsonStringEnumMemberName("JEEPNEY")] Jeepney,
}

public sealed class RouteLeg
{
    [JsonPropertyName("type")]
    public required LegType Type { get; init; }

    [JsonPropertyName("route_name")]
    public required string? RouteName { get; init; }

    [JsonPropertyName("polyline")]
    public required string Polyline { get; init; }

    [JsonPropertyName("color")]
    public required string? Color { get; init; }

    [JsonPropertyName("distance")]
    public required double Distance { get; init; }

    [JsonPropertyName("duration")]
    public required double Duration { get; init; }

    [JsonPropertyName("instructions")]
    public required List<Instruction> Instructions { get; init; }

    /// <summary>[minLng, minLat, maxLng, maxLat]</summary>
    [JsonPropertyName("bbox")]
    public required double[] Bbox { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<SuggestionLabel>))]
public enum SuggestionLabel
{
    [JsonStringEnumMemberName("fastest")] Fastest,
    [JsonStringEnumMemberName("least_walking")] LeastWalking,
    [JsonStringEnumMemberName("simplest")] Simplest,
    [JsonStringEnumMemberName("explorer")] Explorer,
}

public sealed class NavigateResponse
{
    [JsonPropertyName("legs")]
    public required List<RouteLeg> Legs { get; init; }

    [JsonPropertyName("total_distance")]
    public required double TotalDistance { get; init; }

    [JsonPropertyName("total_duration")]
    public required double TotalDuration { get; init; }

    [JsonPropertyName("total_transfers")]
    public required int TotalTransfers { get; init; }

    /// <summary>[minLng, minLat, maxLng, maxLat]</summary>
    [JsonPropertyName("global_bbox")]
    public required double[] GlobalBbox { get; init; }
}

public sealed class RouteSuggestion
{
    [JsonPropertyName("label")]
    public required SuggestionLabel Label { get; init; }

    [JsonPropertyName("route")]
    public required NavigateResponse Route { get; init; }
}

public sealed class MultiNavigateResponse
{
    [JsonPropertyName("suggestions")]
    public required List<RouteSuggestion> Suggestions { get; init; }
}

// -------------------------------------------------------------------------
// External service result types
// -------------------------------------------------------------------------

/// <summary>Represents a single maneuver in a walk route (GraphHopper-sourced).</summary>
public sealed class WalkManeuver
{
    public required int Type { get; init; }
    public required string InstructionText { get; init; }
    public required double LengthKm { get; init; }
    public required int TimeSec { get; init; }
}

public sealed class WalkRouteResult
{
    public required string Polyline { get; init; }
    public required double Distance { get; init; }
    public required double Duration { get; init; }
    public required List<WalkManeuver> Maneuvers { get; init; }
}

public sealed class TricycleRouteResult
{
    public required string Polyline { get; init; }
    public required double Distance { get; init; }
    public required double Duration { get; init; }
}
