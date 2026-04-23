using JippyServices.Algorithm.Navigator.Clients;

namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Leg assembly: converts A* path sections into structured RouteLeg objects.
// Ported from lib/routing/leg-assembler.ts
// -------------------------------------------------------------------------

public sealed class LegAssembler(
    GraphHopperClient graphHopper,
    ValhallaClient valhalla,
    InstructionGenerator instructions)
{
    // =====================================================================
    // Build a pure walk-only route (fallback)
    // =====================================================================

    public async Task<List<RouteLeg>> BuildWalkOnlyRouteAsync(LatLng from, LatLng to)
    {
        var walk = await graphHopper.GetWalkRouteAsync(from, to);
        var instr = InstructionGenerator.GenerateWalkInstructions(walk.Maneuvers);
        var bbox = GeoUtils.ComputeBbox([from, to]);

        return [new RouteLeg
        {
            Type = LegType.Walk,
            RouteName = null,
            Polyline = walk.Polyline,
            Color = null,
            Distance = walk.Distance,
            Duration = walk.Duration,
            Instructions = instr,
            Bbox = bbox,
        }];
    }

    // =====================================================================
    // Analyze A* node path into typed sections
    // =====================================================================

    public static List<PathSection> AnalyzeNodePath(List<string> nodePath, Graph graph)
    {
        if (nodePath.Count < 2) return [];

        var sections = new List<PathSection>();
        var i = 0;

        while (i < nodePath.Count - 1)
        {
            var fromId = nodePath[i];
            var toId = nodePath[i + 1];
            var edge = FindEdgeBetween(graph, fromId, toId);
            if (edge == null) { i++; continue; }

            if (edge.Type == EdgeType.Walk)
            {
                // Collect consecutive walk edges into one section
                var walkStartId = fromId;
                var walkEndId = toId;
                i++;
                while (i < nodePath.Count - 1)
                {
                    var nextEdge = FindEdgeBetween(graph, nodePath[i], nodePath[i + 1]);
                    if (nextEdge?.Type != EdgeType.Walk) break;
                    walkEndId = nodePath[i + 1];
                    i++;
                }
                var fromNode = graph.Nodes.GetValueOrDefault(walkStartId);
                var toNode = graph.Nodes.GetValueOrDefault(walkEndId);
                if (fromNode != null && toNode != null)
                    sections.Add(new WalkSection { FromNode = fromNode, ToNode = toNode });
            }
            else if (edge.Type == EdgeType.Tricycle)
            {
                var fromNode = graph.Nodes.GetValueOrDefault(fromId);
                var toNode = graph.Nodes.GetValueOrDefault(toId);
                if (fromNode != null && toNode != null)
                    sections.Add(new TricycleSection { FromNode = fromNode, ToNode = toNode, Edge = edge });
                i++;
            }
            else if (edge.Type == EdgeType.Transit)
            {
                var routeId = edge.RouteId!;
                var firstNode = graph.Nodes[fromId];
                var transitNodes = new List<GraphNode> { firstNode };
                while (i < nodePath.Count - 1)
                {
                    var nextEdge = FindEdgeBetween(graph, nodePath[i], nodePath[i + 1]);
                    if (nextEdge?.Type != EdgeType.Transit || nextEdge.RouteId != routeId) break;
                    transitNodes.Add(graph.Nodes[nodePath[i + 1]]);
                    i++;
                }
                sections.Add(new TransitSection
                {
                    RouteId = routeId,
                    RouteName = edge.RouteName ?? firstNode.RouteName,
                    RouteColor = firstNode.RouteColor,
                    Direction = firstNode.Direction,
                    Nodes = transitNodes,
                });
            }
            else if (edge.Type == EdgeType.Transfer)
            {
                // Transfer edges are short walks between routes — skip
                i++;
            }
            else
            {
                i++;
            }
        }

        return sections;
    }

    // =====================================================================
    // Convert path sections into RouteLeg array
    // =====================================================================

    public async Task<List<RouteLeg>> BuildLegsFromSectionsAsync(List<PathSection> sections)
    {
        var legs = new List<RouteLeg>();

        for (var i = 0; i < sections.Count; i++)
        {
            var section = sections[i];

            switch (section)
            {
                case WalkSection walk:
                {
                    var from = new LatLng(walk.FromNode.Lat, walk.FromNode.Lng);
                    var to = new LatLng(walk.ToNode.Lat, walk.ToNode.Lng);
                    if (GeoUtils.HaversineMeters(from, to) < 1) continue;

                    var walkRoute = await graphHopper.GetWalkRouteAsync(from, to);
                    legs.Add(new RouteLeg
                    {
                        Type = LegType.Walk,
                        RouteName = null,
                        Polyline = walkRoute.Polyline,
                        Color = null,
                        Distance = walkRoute.Distance,
                        Duration = walkRoute.Duration,
                        Instructions = InstructionGenerator.GenerateWalkInstructions(walkRoute.Maneuvers),
                        Bbox = GeoUtils.ComputeBbox([from, to]),
                    });
                    break;
                }

                case TricycleSection tri:
                {
                    var from = new LatLng(tri.FromNode.Lat, tri.FromNode.Lng);
                    var to = new LatLng(tri.ToNode.Lat, tri.ToNode.Lng);
                    var stationName = tri.Edge.StationName ?? "tricycle station";
                    var fromIsStation = tri.FromNode.Id.StartsWith("tricycle:");
                    var actualIsHail = !fromIsStation;

                    // Non-hail station → jeepney: use local road geometry
                    if (!actualIsHail && tri.ToNode.Id != RoutingConstants.VirtualEndId)
                    {
                        var straightDist = GeoUtils.HaversineMeters(from, to);
                        if (straightDist < 1) continue;
                        var leg = await BuildLocalTricycleLegAsync(from, to, stationName);
                        legs.Add(leg);
                        break;
                    }

                    // For hail rides: route from station, emit walk leg to station first
                    var routeFrom = from;
                    if (actualIsHail && tri.Edge.StationPoint.HasValue)
                    {
                        var stationPt = tri.Edge.StationPoint.Value;
                        var walkToStation = GeoUtils.HaversineMeters(from, stationPt);
                        if (walkToStation > 10)
                        {
                            try
                            {
                                var walkRoute = await graphHopper.GetWalkRouteAsync(from, stationPt);
                                legs.Add(new RouteLeg
                                {
                                    Type = LegType.Walk,
                                    RouteName = null,
                                    Polyline = walkRoute.Polyline,
                                    Color = null,
                                    Distance = walkRoute.Distance,
                                    Duration = walkRoute.Duration,
                                    Instructions = InstructionGenerator.GenerateWalkInstructions(walkRoute.Maneuvers),
                                    Bbox = GeoUtils.ComputeBbox([from, stationPt]),
                                });
                            }
                            catch
                            {
                                legs.Add(new RouteLeg
                                {
                                    Type = LegType.Walk,
                                    RouteName = null,
                                    Polyline = PolylineCodec.Encode([from, stationPt]),
                                    Color = null,
                                    Distance = walkToStation * 1.2,
                                    Duration = Math.Round(walkToStation * 1.2 / GeoUtils.SpeedMps(RoutingConstants.WalkSpeedKmh)),
                                    Instructions = [new Instruction { Text = "Walk to tricycle station", ManeuverType = ManeuverType.Depart }],
                                    Bbox = GeoUtils.ComputeBbox([from, stationPt]),
                                });
                            }
                        }
                        routeFrom = stationPt;
                    }

                    var tricycleLeg = await BuildTricycleLegAsync(routeFrom, to, stationName, actualIsHail);
                    legs.Add(tricycleLeg);
                    break;
                }

                case TransitSection transit:
                {
                    if (transit.Nodes.Count < 2) continue;

                    var coords = transit.Nodes.Select(n => new LatLng(n.Lat, n.Lng)).ToList();
                    var polyline = PolylineCodec.Encode(coords);

                    double distance = 0;
                    for (var j = 0; j < coords.Count - 1; j++)
                        distance += GeoUtils.HaversineMeters(coords[j], coords[j + 1]);

                    var duration = (int)Math.Round(distance / GeoUtils.SpeedMps(RoutingConstants.JeepneySpeedKmh));

                    var segment = new PathSegment
                    {
                        RouteId = transit.RouteId,
                        Direction = transit.Direction,
                        RouteName = transit.RouteName,
                        RouteColor = transit.RouteColor,
                        Nodes = transit.Nodes,
                    };
                    var instr = await instructions.GenerateJeepneyInstructionsAsync(segment, distance);

                    // Add transfer instruction if next section is transit on different route
                    if (i < sections.Count - 1 && sections[i + 1] is TransitSection nextTransit
                        && nextTransit.RouteId != transit.RouteId)
                    {
                        instr.Add(InstructionGenerator.GenerateTransferInstruction(transit.RouteName, nextTransit.RouteName));
                    }

                    var bbox = GeoUtils.ComputeBbox(coords);
                    legs.Add(new RouteLeg
                    {
                        Type = LegType.Jeepney,
                        RouteName = transit.RouteName,
                        Polyline = polyline,
                        Color = transit.RouteColor,
                        Distance = distance,
                        Duration = duration,
                        Instructions = instr,
                        Bbox = bbox,
                    });
                    break;
                }
            }
        }

        return await FillLegGapsAsync(legs);
    }

    // =====================================================================
    // Gap filler — bridges disconnects between consecutive legs
    // =====================================================================

    /// <summary>
    /// After leg assembly, detect cases where the end of one leg does not
    /// connect to the start of the next (GraphHopper road-snapping causes
    /// this). When a gap > 10 m is found, a bridging WALK is inserted via
    /// GraphHopper. If the following leg is already a WALK, the two walks
    /// are merged to avoid WALK→WALK.
    /// </summary>
    private async Task<List<RouteLeg>> FillLegGapsAsync(List<RouteLeg> legs)
    {
        const double GapThresholdMeters = 10;
        var result = new List<RouteLeg>();

        for (var i = 0; i < legs.Count; i++)
        {
            var leg = legs[i];

            if (i == 0)
            {
                result.Add(leg);
                continue;
            }

            var prevLeg = result[^1];
            var prevCoords = PolylineCodec.Decode(prevLeg.Polyline);
            var currCoords = PolylineCodec.Decode(leg.Polyline);

            if (prevCoords.Count == 0 || currCoords.Count == 0)
            {
                result.Add(leg);
                continue;
            }

            var prevEnd = prevCoords[^1];
            var currStart = currCoords[0];
            var gap = GeoUtils.HaversineMeters(prevEnd, currStart);

            if (gap <= GapThresholdMeters)
            {
                result.Add(leg);
                continue;
            }

            // Build bridging walk from end of previous leg to start of current.
            List<LatLng> glueCoords;
            double glueDistance;
            double glueDuration;
            List<Instruction> glueInstructions;

            try
            {
                var walk = await graphHopper.GetWalkRouteAsync(prevEnd, currStart);
                glueCoords = PolylineCodec.Decode(walk.Polyline);
                glueDistance = walk.Distance;
                glueDuration = walk.Duration;
                glueInstructions = InstructionGenerator.GenerateWalkInstructions(walk.Maneuvers);
            }
            catch
            {
                glueCoords = [prevEnd, currStart];
                glueDistance = gap * 1.2;
                glueDuration = Math.Round(gap * 1.2 / GeoUtils.SpeedMps(RoutingConstants.WalkSpeedKmh));
                glueInstructions =
                [
                    new Instruction { Text = "Walk to continue", ManeuverType = ManeuverType.Depart },
                    new Instruction { Text = "Arrive at destination", ManeuverType = ManeuverType.Arrive },
                ];
            }

            if (leg.Type == LegType.Walk)
            {
                // Merge glue walk with the existing walk leg to avoid WALK→WALK.
                var lastGlue = glueCoords[^1];
                var startSlice = GeoUtils.HaversineMeters(lastGlue, currCoords[0]) < 5 ? 1 : 0;
                var mergedCoords = glueCoords.Concat(currCoords.Skip(startSlice)).ToList();

                // Drop the "arrive" instruction from the glue before prepending.
                var filteredGlue = glueInstructions
                    .Where(ins => ins.ManeuverType != ManeuverType.Arrive)
                    .ToList();

                var glueBbox = GeoUtils.ComputeBbox(glueCoords);

                result.Add(new RouteLeg
                {
                    Type = LegType.Walk,
                    RouteName = null,
                    Polyline = PolylineCodec.Encode(mergedCoords),
                    Color = null,
                    Distance = glueDistance + leg.Distance,
                    Duration = glueDuration + leg.Duration,
                    Instructions = [.. filteredGlue, .. leg.Instructions],
                    Bbox = GeoUtils.MergeBbox(glueBbox, leg.Bbox),
                });
            }
            else
            {
                // Insert a separate WALK leg before the current leg.
                var glueBbox = GeoUtils.ComputeBbox(glueCoords);
                result.Add(new RouteLeg
                {
                    Type = LegType.Walk,
                    RouteName = null,
                    Polyline = PolylineCodec.Encode(glueCoords),
                    Color = null,
                    Distance = glueDistance,
                    Duration = glueDuration,
                    Instructions = glueInstructions,
                    Bbox = glueBbox,
                });
                result.Add(leg);
            }
        }

        return result;
    }

    // =====================================================================
    // Tricycle leg builders
    // =====================================================================


    private async Task<RouteLeg> BuildTricycleLegAsync(
        LatLng from, LatLng to, string stationName, bool isHail)
    {
        string polyline;
        double distance;
        double duration;

        try
        {
            var route = await valhalla.GetTricycleRouteAsync(from, to);
            polyline = route.Polyline;
            distance = route.Distance;
            duration = route.Duration;
        }
        catch
        {
            polyline = PolylineCodec.Encode([from, to]);
            distance = GeoUtils.HaversineMeters(from, to) * 1.2;
            duration = Math.Round(distance / GeoUtils.SpeedMps(RoutingConstants.TricycleSpeedKmh));
        }

        return new RouteLeg
        {
            Type = LegType.Tricycle,
            RouteName = stationName,
            Polyline = polyline,
            Color = null,
            Distance = distance,
            Duration = duration,
            Instructions = InstructionGenerator.GenerateTricycleInstructions(stationName, isHail),
            Bbox = GeoUtils.ComputeBbox([from, to]),
        };
    }

    /// <summary>
    /// Build a tricycle leg using local road geometry (GraphHopper walking
    /// geometry at tricycle speed) for station → jeepney transfers.
    /// </summary>
    private async Task<RouteLeg> BuildLocalTricycleLegAsync(
        LatLng from, LatLng to, string stationName)
    {
        string polyline;
        double distance;
        var straight = GeoUtils.HaversineMeters(from, to);

        // Try Valhalla first; fall back to GraphHopper walking geometry
        try
        {
            var route = await valhalla.GetTricycleRouteAsync(from, to);
            if (route.Distance <= straight * 2.0)
            {
                polyline = route.Polyline;
                distance = route.Distance;
            }
            else throw new InvalidOperationException("detour too high");
        }
        catch
        {
            try
            {
                var walk = await graphHopper.GetWalkRouteAsync(from, to);
                polyline = walk.Polyline;
                distance = walk.Distance;
            }
            catch
            {
                polyline = PolylineCodec.Encode([from, to]);
                distance = straight * 1.2;
            }
        }

        var duration = (int)Math.Round(distance / GeoUtils.SpeedMps(RoutingConstants.TricycleSpeedKmh));

        return new RouteLeg
        {
            Type = LegType.Tricycle,
            RouteName = stationName,
            Polyline = polyline,
            Color = null,
            Distance = distance,
            Duration = duration,
            Instructions = InstructionGenerator.GenerateTricycleInstructions(stationName, false),
            Bbox = GeoUtils.ComputeBbox([from, to]),
        };
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    private static GraphEdge? FindEdgeBetween(Graph graph, string fromId, string toId)
    {
        if (!graph.Edges.TryGetValue(fromId, out var edges)) return null;
        return edges.Find(e => e.To == toId);
    }
}
