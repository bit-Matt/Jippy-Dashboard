namespace JippyServices.Algorithm.Weights;

/// <summary>
/// A compact subset of <see cref="RoutingConfig"/> passed directly into
/// <see cref="GraphBuilder.BuildCostedAdjacency"/> and <see cref="AStarPathfinder"/>.
/// The base profile is produced by <see cref="RoutingConfig.ToBaseProfile"/>;
/// diversity-iteration variants are built by <c>NavigatorV2.BuildDiversityProfile</c>.
/// </summary>
internal sealed class WeightProfile
{
    /// <summary>Multiplier applied to walk costs beyond <see cref="WalkComfortMeters"/>.</summary>
    public required double WalkPenaltyMultiplier { get; init; }

    /// <summary>Distance in metres up to which walking incurs no additional penalty.</summary>
    public required double WalkComfortMeters { get; init; }

    /// <summary>Rate at which walk penalty increases per metre beyond the comfort threshold.</summary>
    public required double WalkEscalationRate { get; init; }

    /// <summary>Multiplier applied to transit edge distances in cost computation and heuristic.</summary>
    public required double TransitCostFactor { get; init; }

    /// <summary>Fixed penalty in metres added to each jeepney-to-jeepney transfer edge.</summary>
    public required double TransferPenaltyMeters { get; init; }

    /// <summary>Scaling factor applied to the pre-computed boarding cost for each transit node.</summary>
    public required double BoardingCostFactor { get; init; }

    /// <summary>Cost multiplier for edges intersecting an active road closure polygon.</summary>
    public required double ClosurePenaltyMultiplier { get; init; }

    /// <summary>
    /// Set of route IDs that receive an additional diversity penalty during multi-suggestion
    /// iteration. <see langword="null"/> or empty on the first (base) iteration.
    /// </summary>
    public HashSet<string>? PenalizedRouteIds { get; init; }

    /// <summary>
    /// Additional cost in metres added to edges belonging to routes in <see cref="PenalizedRouteIds"/>.
    /// Only meaningful when <see cref="PenalizedRouteIds"/> is non-empty.
    /// </summary>
    public double? DiversityPenalty { get; init; }

    /// <summary>
    /// Hard transfer limit enforced by A*. Paths requiring more transfers are pruned.
    /// Mirrors <see cref="AlgorithmWeights.MaxTransfersToShow"/>.
    /// </summary>
    public int? MaxTransfers { get; init; }
}
