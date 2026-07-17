using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Contracts.V2.Responses;
using JippyServices.Algorithm.Data;
using JippyServices.Algorithm.Navigator.Common;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Navigator.V3.Types;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Navigator.V3;

/// <summary>
/// Stop-based <see cref="INavigator"/> (v3). Boarding, transfers, and drop-offs
/// only occur at public stops. Tricycle stations are not used; access/egress walks
/// inside a tricycle region are labeled <see cref="LegType.WalkTricycle"/>.
/// </summary>
internal sealed class NavigatorV3 : INavigator
{
    private readonly IWeightsManager _weightsManager;
    private readonly GraphBuilderV3 _graphBuilder;
    private readonly LegAssemblerV3 _legAssembler;

    public NavigatorV3(
        DataContext db,
        INominatimServiceClient nominatimServiceClient,
        [FromKeyedServices("osrm_foot")] IOSRMClient walkClient,
        ITransitDataCacheV3 transitDataCache,
        IWeightsManager weightsManager)
    {
        _weightsManager = weightsManager;
        _graphBuilder = new GraphBuilderV3(db, walkClient, transitDataCache, weightsManager);
        _legAssembler = new LegAssemblerV3(nominatimServiceClient, walkClient);
    }

    public async Task<MultiNavigateResponse> ComputeRouteAsync(
        LatLng start, LatLng end, RoutingConfig? config = null)
    {
        config ??= _weightsManager.GetConfig();

        var straightLineDistance = GeoUtils.HaversineMeters(start, end);
        if (straightLineDistance < config.WalkOnlyThresholdMeters)
        {
            var shortBuild = await _graphBuilder.BuildBaseGraphAsync(start, end, config);
            var startInRegion = shortBuild?.Graph.StartInRegion ?? false;
            var endInRegion = shortBuild?.Graph.EndInRegion ?? false;
            var walkOnly = AssembleResponse(
                await _legAssembler.BuildWalkOnlyRouteAsync(start, end, startInRegion || endInRegion));
            return new MultiNavigateResponse
            {
                Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }],
            };
        }

        var result = await _graphBuilder.BuildBaseGraphAsync(start, end, config);
        if (result == null)
        {
            var walkOnly = AssembleResponse(
                await _legAssembler.BuildWalkOnlyRouteAsync(start, end, false));
            return new MultiNavigateResponse
            {
                Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }],
            };
        }

        var (baseGraph, _) = result.Value;

        if (!baseGraph.HasAccessEdges || !baseGraph.HasEgressEdges)
        {
            var walkOnly = AssembleResponse(
                await _legAssembler.BuildWalkOnlyRouteAsync(
                    start, end, baseGraph.StartInRegion || baseGraph.EndInRegion));
            return new MultiNavigateResponse
            {
                Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }],
            };
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

        var filtered = pruned.Where(s => !HasLongMidRouteWalk(s.Route.Legs, config)).ToList();
        var final = filtered.Count > 0 ? filtered : pruned;

        if (final.Count == 0)
        {
            var walkOnly = AssembleResponse(
                await _legAssembler.BuildWalkOnlyRouteAsync(
                    start, end, baseGraph.StartInRegion || baseGraph.EndInRegion));
            return new MultiNavigateResponse
            {
                Suggestions = [new RouteSuggestion { Label = TransferCountToLabel(0), Route = walkOnly }],
            };
        }

        var labeled = final.Select(s => new RouteSuggestion
        {
            Label = TransferCountToLabel(s.Route.TotalTransfers),
            Route = s.Route,
        }).ToList();

        return new MultiNavigateResponse { Suggestions = labeled };
    }

    private static List<string> GetNearbyStartingRoutes(BaseGraphV3 baseGraph)
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
        string startingRouteId, BaseGraphV3 baseGraph, RoutingConfig config, double odDistanceMeters)
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

            var adjacency = GraphBuilderV3.BuildCostedAdjacency(
                baseGraph.BaseEdges, baseGraph.RawBoardingCosts,
                accessDistances, baseGraph.EgressWalkDistances,
                baseGraph.Nodes, baseGraph.BoardingNodes, profile, config);

            var graph = new Graph { Nodes = baseGraph.Nodes, Edges = adjacency };
            var nodePath = AStarPathfinder.FindOptimalPath(
                graph, RoutingConstants.VirtualStartId, RoutingConstants.VirtualEndId, profile);
            if (nodePath is not { Count: >= 2 }) break;

            var legs = await AssembleLegsAsync(
                nodePath, graph, config, odDistanceMeters,
                baseGraph.StartInRegion, baseGraph.EndInRegion, baseGraph.BoardingNodes);
            if (legs == null) break;

            var response = AssembleResponse(legs);
            if (response.TotalTransfers > config.MaxTransfersToShow) break;

            results.Add(new RouteSuggestion
            {
                Label = TransferCountToLabel(response.TotalTransfers),
                Route = response,
            });

            foreach (var routeId in ExtractRouteIdsFromPath(nodePath, baseGraph.Nodes))
            {
                if (routeId == startingRouteId) continue;
                penalizedRouteIds.Add(routeId);
            }
        }

        return results;
    }

    private static Dictionary<string, double> FilterAccessWalkDistancesToRoute(
        BaseGraphV3 baseGraph, string routeId)
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
            if (leg.Type is not LegType.Jeepney) continue;

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

    private async Task<List<RouteLeg>?> AssembleLegsAsync(
        List<string> nodePath,
        Graph graph,
        RoutingConfig config,
        double odDistanceMeters,
        bool startInRegion,
        bool endInRegion,
        Dictionary<string, StopPoint> boardingNodes)
    {
        var sections = LegAssemblerV3.AnalyzeNodePath(nodePath, graph);
        if (sections.Count == 0) return null;

        sections = MergeSameRouteSections(sections);
        sections = FilterShortTransitSections(sections, config, odDistanceMeters);
        if (sections.Count == 0) return null;

        var legs = await _legAssembler.BuildLegsFromSectionsAsync(
            sections, config, startInRegion, endInRegion, boardingNodes);
        return legs.Count == 0 ? null : legs;
    }

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

    private static List<RouteSuggestion> RemoveWalkDominatedSuggestions(List<RouteSuggestion> suggestions)
    {
        if (suggestions.Count <= 1) return suggestions;

        const double walkDominanceGapMeters = 300;
        var walkDistances = suggestions.Select(s => TotalWalkDistance(s.Route.Legs)).ToList();
        var dominated = new bool[suggestions.Count];

        for (var i = 0; i < suggestions.Count; i++)
        {
            if (dominated[i]) continue;

            for (var j = 0; j < suggestions.Count; j++)
            {
                if (i == j || dominated[j]) continue;
                if (suggestions[i].Route.TotalTransfers != suggestions[j].Route.TotalTransfers) continue;
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
        => legs.Where(l => l.Type is LegType.Walk or LegType.WalkTricycle).Sum(l => l.Distance);

    private static List<PathSection> MergeSameRouteSections(List<PathSection> sections)
    {
        if (sections.Count <= 1) return sections;
        var merged = new List<PathSection> { sections[0] };

        for (var i = 1; i < sections.Count; i++)
        {
            var prev = merged[^1];
            var curr = sections[i];

            if (prev is TransitSection pt && curr is TransitSection ct && pt.RouteId == ct.RouteId)
                pt.Nodes.AddRange(ct.Nodes);
            else
                merged.Add(curr);
        }

        return merged;
    }

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

    private static bool HasLongMidRouteWalk(List<RouteLeg> legs, RoutingConfig config)
    {
        for (var i = 1; i < legs.Count - 1; i++)
        {
            if (legs[i].Type is LegType.Walk or LegType.WalkTricycle
                && legs[i].Distance >= config.LongWalkThresholdMeters)
                return true;
        }
        return false;
    }

    private static NavigateResponse AssembleResponse(List<RouteLeg> legs)
    {
        double totalDistance = 0;
        double totalDuration = 0;
        double totalFare = 0;
        var totalTransfers = CountTransitTransfers(legs);

        var minLng = double.MaxValue;
        var minLat = double.MaxValue;
        var maxLng = double.MinValue;
        var maxLat = double.MinValue;

        foreach (var leg in legs)
        {
            totalDistance += leg.Distance;
            totalDuration += leg.Duration;
            totalFare += leg.Fare;

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
            TotalFare = Math.Round(totalFare * 100) / 100,
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
