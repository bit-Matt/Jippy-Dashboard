namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Main routing orchestrator — multi-suggestion with weight profiles.
// Ported from lib/routing/index.ts
// -------------------------------------------------------------------------

public sealed class NavigationService(GraphBuilder graphBuilder, LegAssembler legAssembler, ILogger<NavigationService> logger)
{
    /// <summary>
    /// Compute multi-suggestion transit routing from start to end.
    /// </summary>
    public async Task<MultiNavigateResponse> ComputeRouteAsync(LatLng start, LatLng end)
    {
        var straightLineDistance = GeoUtils.HaversineMeters(start, end);
        if (straightLineDistance < RoutingConstants.WalkOnlyThresholdMeters)
        {
            var walkOnly = AssembleResponse(await legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = SuggestionLabel.Fastest, Route = walkOnly }] };
        }

        var now = DateTime.UtcNow;
        var result = await graphBuilder.BuildBaseGraphAsync(start, end, now);
        if (result == null)
        {
            var walkOnly = AssembleResponse(await legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = SuggestionLabel.Fastest, Route = walkOnly }] };
        }

        var (baseGraph, transitData) = result.Value;

        if (!baseGraph.HasAccessEdges || !baseGraph.HasEgressEdges)
        {
            var walkOnly = AssembleResponse(await legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = SuggestionLabel.Fastest, Route = walkOnly }] };
        }

        // Run 3 profiles in parallel (pure computation on shared base graph)
        var profileTasks = new[]
        {
            RunProfileAsync(SuggestionLabel.Fastest, RoutingConstants.ProfileFastest, baseGraph),
            RunProfileAsync(SuggestionLabel.LeastWalking, RoutingConstants.ProfileLeastWalking, baseGraph),
            RunProfileAsync(SuggestionLabel.Simplest, RoutingConstants.ProfileSimplest, baseGraph),
        };
        var profileResults = await Task.WhenAll(profileTasks);

        var suggestions = profileResults.Where(s => s != null).Cast<RouteSuggestion>().ToList();

        // Explorer: penalise fastest route's transit lines
        var fastest = suggestions.Find(s => s.Label == SuggestionLabel.Fastest);
        if (fastest != null)
        {
            var explorer = await RunExplorerProfileAsync(fastest.Route, baseGraph, transitData);
            if (explorer != null) suggestions.Add(explorer);
        }

        var deduped = DeduplicateSuggestions(suggestions);

        // Drop suggestions with a long mid-route walk unless that leaves us empty
        var filtered = deduped.Where(s => !HasLongMidRouteWalk(s.Route.Legs)).ToList();
        var final = filtered.Count > 0 ? filtered : deduped;

        if (final.Count == 0)
        {
            var walkOnly = AssembleResponse(await legAssembler.BuildWalkOnlyRouteAsync(start, end));
            return new MultiNavigateResponse { Suggestions = [new RouteSuggestion { Label = SuggestionLabel.Fastest, Route = walkOnly }] };
        }

        return new MultiNavigateResponse { Suggestions = final };
    }

    // =====================================================================
    // Run a single weight profile
    // =====================================================================

    private async Task<RouteSuggestion?> RunProfileAsync(
        SuggestionLabel label, WeightProfile profile, BaseGraph baseGraph)
    {
        var adjacency = GraphBuilder.BuildCostedAdjacency(
            baseGraph.BaseEdges, baseGraph.RawBoardingCosts,
            baseGraph.AccessWalkDistances, baseGraph.EgressWalkDistances,
            baseGraph.Nodes, profile, baseGraph.StopRestrictedNodes);

        var graph = new Graph { Nodes = baseGraph.Nodes, Edges = adjacency };
        var nodePath = AStarPathfinder.FindOptimalPath(
            graph, RoutingConstants.VirtualStartId, RoutingConstants.VirtualEndId, profile);
        if (nodePath is not { Count: >= 2 }) return null;

        var legs = await AssembleLegsAsync(nodePath, graph);
        if (legs == null) return null;

        return new RouteSuggestion { Label = label, Route = AssembleResponse(legs) };
    }

    // =====================================================================
    // Explorer route — topologically diverse alternative
    // =====================================================================

    private async Task<RouteSuggestion?> RunExplorerProfileAsync(
        NavigateResponse fastestResponse, BaseGraph baseGraph, TransitData transitData)
    {
        var fastestRouteIds = new HashSet<string>();
        foreach (var leg in fastestResponse.Legs)
        {
            if (leg.Type == LegType.Jeepney && leg.RouteName != null)
            {
                foreach (var route in transitData.Routes)
                {
                    if (route.RouteName == leg.RouteName)
                        fastestRouteIds.Add(route.Id);
                }
            }
        }
        if (fastestRouteIds.Count == 0) return null;

        var explorerProfile = new WeightProfile
        {
            WalkPenaltyMultiplier = RoutingConstants.ProfileFastest.WalkPenaltyMultiplier,
            WalkComfortMeters = RoutingConstants.ProfileFastest.WalkComfortMeters,
            WalkEscalationRate = RoutingConstants.ProfileFastest.WalkEscalationRate,
            TransitCostFactor = RoutingConstants.ProfileFastest.TransitCostFactor,
            TransferPenaltyMeters = RoutingConstants.ProfileFastest.TransferPenaltyMeters,
            BoardingCostFactor = RoutingConstants.ProfileFastest.BoardingCostFactor,
            ClosurePenaltyMultiplier = RoutingConstants.ProfileFastest.ClosurePenaltyMultiplier,
            PenalizedRouteIds = fastestRouteIds,
            DiversityPenalty = RoutingConstants.ExplorerDiversityPenalty,
            MaxTransfers = RoutingConstants.ExplorerMaxTransfers,
        };

        var adjacency = GraphBuilder.BuildCostedAdjacency(
            baseGraph.BaseEdges, baseGraph.RawBoardingCosts,
            baseGraph.AccessWalkDistances, baseGraph.EgressWalkDistances,
            baseGraph.Nodes, explorerProfile, baseGraph.StopRestrictedNodes);

        var graph = new Graph { Nodes = baseGraph.Nodes, Edges = adjacency };
        var nodePath = AStarPathfinder.FindOptimalPath(
            graph, RoutingConstants.VirtualStartId, RoutingConstants.VirtualEndId, explorerProfile);
        if (nodePath is not { Count: >= 2 }) return null;

        var legs = await AssembleLegsAsync(nodePath, graph);
        if (legs == null) return null;

        var explorerResponse = AssembleResponse(legs);

        // Time cap: discard if significantly slower than fastest
        if (explorerResponse.TotalDuration > fastestResponse.TotalDuration * RoutingConstants.ExplorerDurationCap)
            return null;

        return new RouteSuggestion { Label = SuggestionLabel.Explorer, Route = explorerResponse };
    }

    // =====================================================================
    // Shared leg assembly from A* path
    // =====================================================================

    private async Task<List<RouteLeg>?> AssembleLegsAsync(List<string> nodePath, Graph graph)
    {
        var sections = LegAssembler.AnalyzeNodePath(nodePath, graph);
        if (sections.Count == 0) return null;

        // Merge consecutive transit sections on same route
        sections = MergeSameRouteSections(sections);

        // Filter short transit sections
        sections = FilterShortTransitSections(sections);
        if (sections.Count == 0) return null;

        var legs = await legAssembler.BuildLegsFromSectionsAsync(sections);
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

    private static List<PathSection> FilterShortTransitSections(List<PathSection> sections)
    {
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
            return dist >= RoutingConstants.MinTransitRideMeters;
        }).ToList();
    }

    private static bool HasLongMidRouteWalk(List<RouteLeg> legs)
    {
        for (var i = 1; i < legs.Count - 1; i++)
        {
            if (legs[i].Type == LegType.Walk && legs[i].Distance >= RoutingConstants.LongWalkThresholdMeters)
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
        var totalTransfers = 0;

        var minLng = double.MaxValue;
        var minLat = double.MaxValue;
        var maxLng = double.MinValue;
        var maxLat = double.MinValue;

        for (var i = 0; i < legs.Count; i++)
        {
            var leg = legs[i];
            totalDistance += leg.Distance;
            totalDuration += leg.Duration;

            if (i > 0
                && (leg.Type is LegType.Jeepney or LegType.Tricycle)
                && (legs[i - 1].Type is LegType.Jeepney or LegType.Tricycle))
            {
                totalTransfers++;
            }

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
