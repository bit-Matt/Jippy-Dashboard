using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Contracts.V2.Responses;
using JippyServices.Algorithm.Data;
using JippyServices.Algorithm.Navigator.Cache;
using JippyServices.Algorithm.Navigator.Common;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Navigator.V2;

/// <summary>
/// Production <see cref="INavigator"/> implementation (v2).
/// Orchestrates a multi-suggestion A* transit routing pipeline:
/// <list type="number">
///   <item><description>Short trips fall back immediately to walk-only.</description></item>
///   <item><description>The base graph is built by <see cref="GraphBuilder.BuildBaseGraphAsync"/>.</description></item>
///   <item><description>Per-starting-route diversity iteration produces multiple route suggestions.</description></item>
///   <item><description>Suggestions are ranked, deduplicated, and pruned by dominance and walk-dominance filters.</description></item>
///   <item><description>Final legs are assembled by <see cref="LegAssembler"/> with OSRM polylines and Nominatim instructions.</description></item>
/// </list>
/// </summary>
internal sealed class NavigatorV2 : INavigator
{
    private readonly IWeightsManager _weightsManager;

    private readonly GraphBuilder _graphBuilder;
    private readonly LegAssembler _legAssembler;

    public NavigatorV2(
        DataContext db,
        INominatimServiceClient nominatimServiceClient,
        [FromKeyedServices("osrm_foot")] IOSRMClient walkClient,
        [FromKeyedServices("osrm_bicycle")] IOSRMClient tricycleClient,
        ITransitDataCache transitDataCache,
        IWeightsManager weightsManager)
    {
        _weightsManager = weightsManager;

        _graphBuilder = new GraphBuilder(db, walkClient, transitDataCache, weightsManager);
        _legAssembler = new LegAssembler(nominatimServiceClient, walkClient, tricycleClient);
    }

    /// <summary>
    /// Compute multi-suggestion transit routing from start to end.
    /// Suggestions are enumerated per nearby starting route, ranked by transfer count.
    /// </summary>
    public async Task<MultiNavigateResponse> ComputeRouteAsync(
        LatLng start, LatLng end, RoutingConfig? config = null)
    {
        config ??= _weightsManager.GetConfig();

        var straightLineDistance = GeoUtils.HaversineMeters(start, end);
        if (straightLineDistance < config.WalkOnlyThresholdMeters)
        {
            var walkOnly = AssembleResponse(await _legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }] };
        }

        var now = DateTime.UtcNow;
        var result = await _graphBuilder.BuildBaseGraphAsync(start, end, now, config);
        if (result == null)
        {
            var walkOnly = AssembleResponse(await _legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }] };
        }

        var (baseGraph, _) = result.Value;

        if (!baseGraph.HasAccessEdges || !baseGraph.HasEgressEdges)
        {
            var walkOnly = AssembleResponse(await _legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }] };
        }

        var startingRouteIds = GetNearbyStartingRoutes(baseGraph)
            .Take(config.MaxStartingRoutes);

        var allSuggestions = new List<RouteSuggestion>();
        foreach (var routeId in startingRouteIds)
        {
            var routeSuggestions = await EnumerateStartingRouteSuggestionsAsync(
                routeId, baseGraph, config, straightLineDistance);
            allSuggestions.AddRange(routeSuggestions);
        }

        var sorted = allSuggestions
            .OrderBy(s => s.Route.TotalTransfers)
            .ThenBy(s => TotalWalkDistance(s.Route.Legs))
            .ThenBy(s => s.Route.TotalDuration)
            .ToList();

        var deduped = DeduplicateSuggestions(sorted);
        var pruned = RemoveDominatedSuggestions(deduped);
        pruned = RemoveWalkDominatedSuggestions(pruned);
        pruned = RemoveJeepneySandwichedTricycleSuggestions(pruned);

        // Drop suggestions with a long mid-route walk unless that leaves us empty
        var filtered = pruned.Where(s => !HasLongMidRouteWalk(s.Route.Legs, config)).ToList();
        var final = filtered.Count > 0 ? filtered : pruned;

        if (final.Count == 0)
        {
            var walkOnly = AssembleResponse(await _legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }] };
        }

        var labeled = final.Select(s => new RouteSuggestion
        {
            Label = TransferCountToLabel(s.Route.TotalTransfers),
            Route = s.Route,
        }).ToList();

        return new MultiNavigateResponse { Suggestions = labeled };
    }

    // =====================================================================
    // Per-starting-route enumeration
    // =====================================================================

    private static List<string> GetNearbyStartingRoutes(BaseGraph baseGraph)
    {
        var closestAccessPerRoute = new Dictionary<string, double>();

        foreach (var (nodeId, dist) in baseGraph.AccessWalkDistances)
        {
            if (!baseGraph.Nodes.TryGetValue(nodeId, out var node)) continue;

            if (!closestAccessPerRoute.TryGetValue(node.RouteId, out var best) || dist < best)
                closestAccessPerRoute[node.RouteId] = dist;
        }

        return closestAccessPerRoute
            .OrderBy(kv => kv.Value)
            .Select(kv => kv.Key)
            .ToList();
    }

    private async Task<List<RouteSuggestion>> EnumerateStartingRouteSuggestionsAsync(
        string startingRouteId, BaseGraph baseGraph, RoutingConfig config, double odDistanceMeters)
    {
        var results = new List<RouteSuggestion>();
        var penalizedRouteIds = new HashSet<string>();
        var accessDistances = FilterAccessWalkDistancesToRoute(baseGraph, startingRouteId);

        if (accessDistances.Count == 0) return results;

        for (var i = 0; i < config.MaxSuggestionsPerStartRoute; i++)
        {
            var profile = i == 0
                ? config.ToBaseProfile()
                : BuildDiversityProfile(config.ToBaseProfile(), penalizedRouteIds, config);

            var adjacency = GraphBuilder.BuildCostedAdjacency(
                baseGraph.BaseEdges, baseGraph.RawBoardingCosts,
                accessDistances, baseGraph.EgressWalkDistances,
                baseGraph.Nodes, profile, baseGraph.StopRestrictedNodes, config);

            var graph = new Graph { Nodes = baseGraph.Nodes, Edges = adjacency };
            var nodePath = AStarPathfinder.FindOptimalPath(
                graph, RoutingConstants.VirtualStartId, RoutingConstants.VirtualEndId, profile);
            if (nodePath is not { Count: >= 2 }) break;

            var legs = await AssembleLegsAsync(nodePath, graph, config, odDistanceMeters);
            if (legs == null) break;

            var response = AssembleResponse(legs);
            if (response.TotalTransfers > config.MaxTransfersToShow) break;

            results.Add(new RouteSuggestion
            {
                Label = TransferCountToLabel(response.TotalTransfers),
                Route = response,
            });

            // Keep the starting route unpenalized so later iterations can still
            // surface alternate second legs (e.g. R3→R55 after R3→R11).
            foreach (var routeId in ExtractRouteIdsFromPath(nodePath, baseGraph.Nodes))
            {
                if (routeId == startingRouteId) continue;
                penalizedRouteIds.Add(routeId);
            }
        }

        return results;
    }

    private static Dictionary<string, double> FilterAccessWalkDistancesToRoute(
        BaseGraph baseGraph, string routeId)
    {
        var filtered = new Dictionary<string, double>();

        foreach (var (nodeId, dist) in baseGraph.AccessWalkDistances)
        {
            if (baseGraph.Nodes.TryGetValue(nodeId, out var node) && node.RouteId == routeId)
                filtered[nodeId] = dist;
        }

        return filtered;
    }

    private static WeightProfile BuildDiversityProfile(
        WeightProfile baseProfile, HashSet<string> penalizedRouteIds, RoutingConfig config)
    {
        return new WeightProfile
        {
            WalkPenaltyMultiplier = baseProfile.WalkPenaltyMultiplier,
            WalkComfortMeters = baseProfile.WalkComfortMeters,
            WalkEscalationRate = baseProfile.WalkEscalationRate,
            TransitCostFactor = baseProfile.TransitCostFactor,
            TransferPenaltyMeters = baseProfile.TransferPenaltyMeters,
            BoardingCostFactor = baseProfile.BoardingCostFactor,
            ClosurePenaltyMultiplier = baseProfile.ClosurePenaltyMultiplier,
            PenalizedRouteIds = penalizedRouteIds,
            DiversityPenalty = config.TransferDiversityPenalty,
            MaxTransfers = config.MaxTransfersToShow,
        };
    }

    private static HashSet<string> ExtractRouteIdsFromPath(
        List<string> nodePath, Dictionary<string, GraphNode> nodes)
    {
        var routeIds = new HashSet<string>();

        foreach (var nodeId in nodePath)
        {
            if (nodes.TryGetValue(nodeId, out var node) && node.RouteId != "__virtual__")
                routeIds.Add(node.RouteId);
        }

        return routeIds;
    }

    private static int CountTransitTransfers(IReadOnlyList<RouteLeg> legs)
    {
        var transfers = 0;
        string? previousTransitKey = null;

        foreach (var leg in legs)
        {
            if (leg.Type is not LegType.Jeepney and not LegType.Tricycle)
                continue;

            var transitKey = leg.RouteName ?? leg.Type.ToString();

            if (previousTransitKey != null
                && !string.Equals(transitKey, previousTransitKey, StringComparison.Ordinal))
            {
                transfers++;
            }

            previousTransitKey = transitKey;
        }

        return transfers;
    }

    private static string TransferCountToLabel(int transferCount) => transferCount switch
    {
        0 => "Direct",
        1 => "1 Transfer",
        _ => $"{transferCount} Transfers",
    };

    // =====================================================================
    // Shared leg assembly from A* path
    // =====================================================================

    private async Task<List<RouteLeg>?> AssembleLegsAsync(
        List<string> nodePath, Graph graph, RoutingConfig config, double odDistanceMeters)
    {
        var sections = LegAssembler.AnalyzeNodePath(nodePath, graph);
        if (sections.Count == 0) return null;

        // Merge consecutive transit sections on same route
        sections = MergeSameRouteSections(sections);

        // Filter short transit sections
        sections = FilterShortTransitSections(sections, config, odDistanceMeters);
        if (sections.Count == 0) return null;

        var legs = await _legAssembler.BuildLegsFromSectionsAsync(sections, config);
        if (legs.Count == 0) return null;

        return legs;
    }

    // =====================================================================
    // Deduplication
    // =====================================================================

    private static List<RouteSuggestion> DeduplicateSuggestions(List<RouteSuggestion> suggestions)
    {
        var seen = new HashSet<string>();
        var result = new List<RouteSuggestion>();

        foreach (var s in suggestions)
        {
            var routeNames = string.Join("|",
                s.Route.Legs
                    .Where(l => l.Type == LegType.Jeepney && l.RouteName != null)
                    .Select(l => l.RouteName!)
                    .OrderBy(n => n));
            var key = $"{routeNames}::{s.Route.TotalTransfers}";
            if (seen.Add(key)) result.Add(s);
        }

        return result;
    }

    /// <summary>
    /// Drop suggestions whose jeepney route set is a strict superset of a simpler
    /// suggestion with fewer/equal transfers and comparable distance.
    /// </summary>
    private static List<RouteSuggestion> RemoveDominatedSuggestions(List<RouteSuggestion> suggestions)
    {
        if (suggestions.Count <= 1) return suggestions;

        var routeSets = suggestions
            .Select(s => new HashSet<string>(
                s.Route.Legs
                    .Where(l => l.Type == LegType.Jeepney && l.RouteName != null)
                    .Select(l => l.RouteName!),
                StringComparer.Ordinal))
            .ToList();

        var dominated = new bool[suggestions.Count];

        for (var i = 0; i < suggestions.Count; i++)
        {
            if (dominated[i]) continue;

            for (var j = 0; j < suggestions.Count; j++)
            {
                if (i == j || dominated[j]) continue;

                var simpler = suggestions[i];
                var complex = suggestions[j];

                if (simpler.Route.TotalTransfers > complex.Route.TotalTransfers) continue;
                if (simpler.Route.TotalDistance > complex.Route.TotalDistance * 1.15) continue;
                if (!routeSets[i].IsProperSubsetOf(routeSets[j])) continue;

                dominated[j] = true;
            }
        }

        var result = new List<RouteSuggestion>();
        for (var k = 0; k < suggestions.Count; k++)
        {
            if (!dominated[k]) result.Add(suggestions[k]);
        }

        return result;
    }

    /// <summary>
    /// Drop suggestions that require substantially more walking than another
    /// option at the same transfer tier (e.g. two walk legs totalling ~900 m
    /// when a direct route needs only ~500 m).
    /// </summary>
    private static List<RouteSuggestion> RemoveWalkDominatedSuggestions(List<RouteSuggestion> suggestions)
    {
        if (suggestions.Count <= 1) return suggestions;

        const double walkDominanceGapMeters = 300;

        var walkDistances = suggestions
            .Select(s => TotalWalkDistance(s.Route.Legs))
            .ToList();

        var dominated = new bool[suggestions.Count];

        for (var i = 0; i < suggestions.Count; i++)
        {
            if (dominated[i]) continue;

            for (var j = 0; j < suggestions.Count; j++)
            {
                if (i == j || dominated[j]) continue;

                var lessWalk = suggestions[i];
                var moreWalk = suggestions[j];

                if (lessWalk.Route.TotalTransfers != moreWalk.Route.TotalTransfers) continue;
                if (walkDistances[i] + walkDominanceGapMeters >= walkDistances[j]) continue;

                dominated[j] = true;
            }
        }

        var result = new List<RouteSuggestion>();
        for (var k = 0; k < suggestions.Count; k++)
        {
            if (!dominated[k]) result.Add(suggestions[k]);
        }

        return result;
    }

    private static double TotalWalkDistance(IReadOnlyList<RouteLeg> legs)
        => legs.Where(l => l.Type == LegType.Walk).Sum(l => l.Distance);

    /// <summary>
    /// Safety-net post-processor: drop routes that use tricycle between jeepney
    /// legs when a jeepney-only option exists with fewer transfers.
    /// A* already enforces this constraint at search time via the HasUsedJeepney
    /// composite state — this filter guards against any edge cases that slip through
    /// (e.g. multi-region graphs where two A* runs are stitched together).
    /// </summary>
    private static List<RouteSuggestion> RemoveJeepneySandwichedTricycleSuggestions(
        List<RouteSuggestion> suggestions)
    {
        if (suggestions.Count <= 1) return suggestions;

        var jeepneyOnly = suggestions
            .Where(s => !HasTricycleBetweenJeepneys(s.Route.Legs))
            .ToList();

        if (jeepneyOnly.Count == 0) return suggestions;

        var minJeepneyOnlyTransfers = jeepneyOnly.Min(s => s.Route.TotalTransfers);

        return suggestions
            .Where(s =>
            {
                if (!HasTricycleBetweenJeepneys(s.Route.Legs)) return true;
                if (s.Route.TotalTransfers > minJeepneyOnlyTransfers) return false;
                return !jeepneyOnly.Any(o => o.Route.TotalTransfers == s.Route.TotalTransfers);
            })
            .ToList();
    }

    private static bool HasTricycleBetweenJeepneys(IReadOnlyList<RouteLeg> legs)
    {
        var firstJeepney = -1;
        var lastJeepney = -1;

        for (var i = 0; i < legs.Count; i++)
        {
            if (legs[i].Type != LegType.Jeepney) continue;
            if (firstJeepney < 0) firstJeepney = i;
            lastJeepney = i;
        }

        if (firstJeepney < 0 || lastJeepney <= firstJeepney) return false;

        for (var i = firstJeepney + 1; i < lastJeepney; i++)
        {
            if (legs[i].Type == LegType.Tricycle) return true;
        }

        return false;
    }

    // =====================================================================
    // Merge + filter helpers
    // =====================================================================

    private static List<PathSection> MergeSameRouteSections(List<PathSection> sections)
    {
        if (sections.Count <= 1) return sections;
        var merged = new List<PathSection> { sections[0] };

        for (var i = 1; i < sections.Count; i++)
        {
            var prev = merged[^1];
            var curr = sections[i];

            if (prev is TransitSection pt && curr is TransitSection ct && pt.RouteId == ct.RouteId)
            {
                pt.Nodes.AddRange(ct.Nodes);
            }
            else
            {
                merged.Add(curr);
            }
        }

        return merged;
    }

    /// <summary>
    /// For short O/D pairs the configured minimum can exceed the only viable jeepney
    /// segment, leaving tricycle-only paths. Scale down with trip length but keep the
    /// configured floor for longer rides.
    /// </summary>
    private static double EffectiveMinTransitRideMeters(double odDistanceMeters, RoutingConfig config)
    {
        var scaled = odDistanceMeters * 0.5;
        return Math.Min(config.MinTransitRideMeters, Math.Max(config.MinTricycleRideMeters, scaled));
    }

    private static List<PathSection> FilterShortTransitSections(
        List<PathSection> sections, RoutingConfig config, double odDistanceMeters)
    {
        var minRideMeters = EffectiveMinTransitRideMeters(odDistanceMeters, config);

        return sections.Where(sec =>
        {
            if (sec is not TransitSection ts) return true;
            double dist = 0;
            for (var i = 0; i < ts.Nodes.Count - 1; i++)
            {
                var a = ts.Nodes[i];
                var b = ts.Nodes[i + 1];
                dist += GeoUtils.HaversineMeters(new LatLng(a.Lat, a.Lng), new LatLng(b.Lat, b.Lng));
            }
            return dist >= minRideMeters;
        }).ToList();
    }

    private bool HasLongMidRouteWalk(List<RouteLeg> legs, RoutingConfig config)
    {
        for (var i = 1; i < legs.Count - 1; i++)
        {
            if (legs[i].Type == LegType.Walk && legs[i].Distance >= config.LongWalkThresholdMeters)
                return true;
        }
        return false;
    }

    // =====================================================================
    // Response assembly
    // =====================================================================

    private static NavigateResponse AssembleResponse(List<RouteLeg> legs)
    {
        double totalDistance = 0;
        double totalDuration = 0;
        var totalTransfers = CountTransitTransfers(legs);

        var minLng = double.MaxValue;
        var minLat = double.MaxValue;
        var maxLng = double.MinValue;
        var maxLat = double.MinValue;

        for (var i = 0; i < legs.Count; i++)
        {
            var leg = legs[i];
            totalDistance += leg.Distance;
            totalDuration += leg.Duration;

            if (leg.Bbox.Length >= 4)
            {
                if (leg.Bbox[0] < minLng) minLng = leg.Bbox[0];
                if (leg.Bbox[1] < minLat) minLat = leg.Bbox[1];
                if (leg.Bbox[2] > maxLng) maxLng = leg.Bbox[2];
                if (leg.Bbox[3] > maxLat) maxLat = leg.Bbox[3];
            }
        }

        return new NavigateResponse
        {
            Legs = legs,
            TotalDistance = Math.Round(totalDistance * 100) / 100,
            TotalDuration = Math.Round(totalDuration),
            TotalTransfers = totalTransfers,
            GlobalBbox =
            [
                minLng == double.MaxValue ? 0 : minLng,
                minLat == double.MaxValue ? 0 : minLat,
                maxLng == double.MinValue ? 0 : maxLng,
                maxLat == double.MinValue ? 0 : maxLat,
            ],
        };
    }
}
