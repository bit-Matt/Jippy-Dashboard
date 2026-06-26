using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Contracts.V2.Responses;
using JippyServices.Algorithm.Navigator.Common;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Polyline;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Navigator.V2;

/// <summary>
/// Leg assembly: converts A* path sections into structured RouteLeg objects.
/// </summary>
internal sealed class LegAssembler {
    private readonly IOSRMClient _walkClient;
    private readonly IOSRMClient _tricycleClient;
    private readonly InstructionGenerator _instructions;

    public LegAssembler(INominatimServiceClient nominatim, IOSRMClient walkClient, IOSRMClient tricycleClient)
    {
        _instructions = new InstructionGenerator(nominatim);
        _walkClient = walkClient;
        _tricycleClient = tricycleClient;
    }
    
    /// <summary>
    /// Build a pure walk-only route (fallback)
    /// </summary>
    /// <param name="from"></param>
    /// <param name="to"></param>
    /// <returns></returns>
    public async Task<List<RouteLeg>> BuildWalkOnlyRouteAsync(LatLng from, LatLng to)
    {
        var walk = await _walkClient.RouteAsync(from, to);
        var instr = InstructionGenerator.GenerateWalkInstructions(walk.Maneuvers);
        var bbox = GeoUtils.ComputeBbox([from, to]);

        return [
            new RouteLeg
            {
                Type = LegType.Walk,
                RouteName = null,
                RouteId = null,
                RouteNumber = null,
                Polyline = walk.Polyline,
                Color = null,
                Distance = walk.Distance,
                Duration = walk.Duration,
                Fare = 0,
                Instructions = instr,
                Bbox = bbox,
            }
        ];
    }

    /// <summary>
    /// Convert an ordered list of node IDs produced by A* into a list of typed
    /// <see cref="PathSection"/> objects, one per contiguous movement of the same mode.
    /// <list type="bullet">
    ///   <item><description>Consecutive <see cref="EdgeType.Walk"/> edges are merged into a single <see cref="WalkSection"/>.</description></item>
    ///   <item><description>Consecutive <see cref="EdgeType.Transit"/> edges on the same route are merged into one <see cref="TransitSection"/>.</description></item>
    ///   <item><description>Each <see cref="EdgeType.Tricycle"/> edge becomes its own <see cref="TricycleSection"/>.</description></item>
    ///   <item><description><see cref="EdgeType.Transfer"/> edges are skipped (they are implicit between transit sections).</description></item>
    /// </list>
    /// </summary>
    /// <param name="nodePath">Ordered node IDs from <see cref="AStarPathfinder.FindOptimalPath"/>.</param>
    /// <param name="graph">The costed graph used to look up edge types between consecutive nodes.</param>
    /// <returns>Ordered list of typed path sections. Empty when the path has fewer than two nodes.</returns>
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

    /// <summary>
    /// Convert typed <see cref="PathSection"/> objects into fully populated <see cref="RouteLeg"/> objects.
    /// For each section:
    /// <list type="bullet">
    ///   <item><description><see cref="WalkSection"/>: calls OSRM foot for the walk polyline and instructions.</description></item>
    ///   <item><description><see cref="TransitSection"/>: clips the route polyline to the boarding/alighting nodes, reverse-geocodes locations, and adds transfer instructions between consecutive transit legs.</description></item>
    ///   <item><description><see cref="TricycleSection"/>: calls OSRM bicycle/driving for the tricycle polyline and generates station or hail instructions.</description></item>
    /// </list>
    /// After assembly, <see cref="FillLegGapsAsync"/> is called to bridge any coordinate gaps
    /// introduced by OSRM road snapping.
    /// </summary>
    /// <param name="sections">Typed path sections from <see cref="AnalyzeNodePath"/>.</param>
    /// <param name="config">Routing config supplying speed and threshold values.</param>
    /// <returns>Ordered list of <see cref="RouteLeg"/> objects, or an empty list on failure.</returns>
    public async Task<List<RouteLeg>> BuildLegsFromSectionsAsync(List<PathSection> sections, RoutingConfig config)
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

                    var walkRoute = await _walkClient.RouteAsync(from, to);
                    legs.Add(new RouteLeg
                    {
                        Type = LegType.Walk,
                        RouteName = null,
                        RouteId = null,
                        RouteNumber = null,
                        Polyline = walkRoute.Polyline,
                        Color = null,
                        Distance = walkRoute.Distance,
                        Duration = walkRoute.Duration,
                        Fare = 0,
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
                        var leg = await BuildLocalTricycleLegAsync(from, to, stationName, config);
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
                                var walkRoute = await _walkClient.RouteAsync(from, stationPt);
                                legs.Add(new RouteLeg
                                {
                                    Type = LegType.Walk,
                                    RouteName = null,
                                    RouteId = null,
                                    RouteNumber = null,
                                    Polyline = walkRoute.Polyline,
                                    Color = null,
                                    Distance = walkRoute.Distance,
                                    Duration = walkRoute.Duration,
                                    Fare = 0,
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
                                    RouteId = null,
                                    RouteNumber = null,
                                    Polyline = PolylineCodec.Encode([from, stationPt]),
                                    Color = null,
                                    Distance = walkToStation * 1.2,
                                    Duration = Math.Round(walkToStation * 1.2 / GeoUtils.SpeedMps(config.WalkSpeedKmh)),
                                    Fare = 0,
                                    Instructions = [new Instruction { Text = "Walk to tricycle station", ManeuverType = ManeuverType.Depart }],
                                    Bbox = GeoUtils.ComputeBbox([from, stationPt]),
                                });
                            }
                        }
                        routeFrom = stationPt;
                    }

                    var tricycleLeg = await BuildTricycleLegAsync(routeFrom, to, stationName, actualIsHail, config);
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

                    var duration = (int)Math.Round(distance / GeoUtils.SpeedMps(config.JeepneySpeedKmh));

                    var segment = new PathSegment
                    {
                        RouteId = transit.RouteId,
                        Direction = transit.Direction,
                        RouteName = transit.RouteName,
                        RouteColor = transit.RouteColor,
                        Nodes = transit.Nodes,
                    };
                    var instr = await _instructions.GenerateJeepneyInstructionsAsync(segment, distance);

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
                        RouteId = transit.RouteId,
                        RouteNumber = transit.Nodes[0].RouteNumber,
                        Polyline = polyline,
                        Color = transit.RouteColor,
                        Distance = distance,
                        Duration = duration,
                        Fare = FareUtils.ComputeJeepneyFare(distance, config),
                        Instructions = instr,
                        Bbox = bbox,
                    });
                    break;
                }
            }
        }

        return await FillLegGapsAsync(legs, config);
    }

    /// <summary>
    /// After leg assembly, detect cases where the end of one leg does not
    /// connect to the start of the next (OSRM road-snapping causes
    /// this). When a gap > 10 m is found, a bridging walk is computed via
    /// OSRM foot and folded into an adjacent WALK leg so access walks do
    /// not appear as a separate leg before boarding.
    /// </summary>
    private async Task<List<RouteLeg>> FillLegGapsAsync(List<RouteLeg> legs, RoutingConfig config)
    {
        const double gapThresholdMeters = 10;
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

            if (gap <= gapThresholdMeters)
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
                var walk = await _walkClient.RouteAsync(prevEnd, currStart);
                glueCoords = PolylineCodec.Decode(walk.Polyline);
                glueDistance = walk.Distance;
                glueDuration = walk.Duration;
                glueInstructions = InstructionGenerator.GenerateWalkInstructions(walk.Maneuvers);
            }
            catch
            {
                glueCoords = [prevEnd, currStart];
                glueDistance = gap * 1.2;
                glueDuration = Math.Round(gap * 1.2 / GeoUtils.SpeedMps(config.WalkSpeedKmh));
                glueInstructions =
                [
                    new Instruction { Text = "Walk to continue", ManeuverType = ManeuverType.Depart },
                    new Instruction { Text = "Arrive at destination", ManeuverType = ManeuverType.Arrive },
                ];
            }

            var filteredGlue = glueInstructions
                .Where(ins => ins.ManeuverType != ManeuverType.Arrive)
                .ToList();

            if (leg.Type == LegType.Walk)
            {
                var mergedCoords = prevLeg.Type == LegType.Walk
                    ? JoinPolylines(JoinPolylines(prevCoords, glueCoords), currCoords)
                    : JoinPolylines(glueCoords, currCoords);

                var mergedInstructions = prevLeg.Type == LegType.Walk
                    ? prevLeg.Instructions
                        .Where(ins => ins.ManeuverType != ManeuverType.Arrive)
                        .Concat(filteredGlue)
                        .Concat(leg.Instructions)
                        .ToList()
                    : [.. filteredGlue, .. leg.Instructions];

                var mergedBbox = prevLeg.Type == LegType.Walk
                    ? GeoUtils.MergeBbox(GeoUtils.MergeBbox(prevLeg.Bbox, GeoUtils.ComputeBbox(glueCoords)), leg.Bbox)
                    : GeoUtils.MergeBbox(GeoUtils.ComputeBbox(glueCoords), leg.Bbox);

                var mergedWalk = new RouteLeg
                {
                    Type = LegType.Walk,
                    RouteName = null,
                    RouteId = null,
                    RouteNumber = null,
                    Polyline = PolylineCodec.Encode(mergedCoords),
                    Color = null,
                    Distance = (prevLeg.Type == LegType.Walk ? prevLeg.Distance : 0) + glueDistance + leg.Distance,
                    Duration = (prevLeg.Type == LegType.Walk ? prevLeg.Duration : 0) + glueDuration + leg.Duration,
                    Fare = 0,
                    Instructions = mergedInstructions,
                    Bbox = mergedBbox,
                };

                if (prevLeg.Type == LegType.Walk)
                    result[^1] = mergedWalk;
                else
                    result.Add(mergedWalk);
            }
            else if (prevLeg.Type == LegType.Walk)
            {
                // Fold the glue walk into the access leg before boarding transit.
                var mergedCoords = JoinPolylines(prevCoords, glueCoords);
                var mergedInstructions = prevLeg.Instructions
                    .Where(ins => ins.ManeuverType != ManeuverType.Arrive)
                    .Concat(filteredGlue)
                    .ToList();

                result[^1] = new RouteLeg
                {
                    Type = LegType.Walk,
                    RouteName = null,
                    RouteId = null,
                    RouteNumber = null,
                    Polyline = PolylineCodec.Encode(mergedCoords),
                    Color = null,
                    Distance = prevLeg.Distance + glueDistance,
                    Duration = prevLeg.Duration + glueDuration,
                    Fare = 0,
                    Instructions = mergedInstructions,
                    Bbox = GeoUtils.MergeBbox(prevLeg.Bbox, GeoUtils.ComputeBbox(glueCoords)),
                };
                result.Add(leg);
            }
            else
            {
                var glueBbox = GeoUtils.ComputeBbox(glueCoords);
                result.Add(new RouteLeg
                {
                    Type = LegType.Walk,
                    RouteName = null,
                    RouteId = null,
                    RouteNumber = null,
                    Polyline = PolylineCodec.Encode(glueCoords),
                    Color = null,
                    Distance = glueDistance,
                    Duration = glueDuration,
                    Fare = 0,
                    Instructions = glueInstructions,
                    Bbox = glueBbox,
                });
                result.Add(leg);
            }
        }

        return result;
    }

    /// <summary>
    /// Concatenate two polyline coordinate lists into one.
    /// When the last point of <paramref name="a"/> is within 5 m of the first point of
    /// <paramref name="b"/>, the duplicate point is skipped to avoid a zero-length segment.
    /// </summary>
    private static List<LatLng> JoinPolylines(List<LatLng> a, List<LatLng> b)
    {
        if (a.Count == 0) return b;
        if (b.Count == 0) return a;
        var startSlice = GeoUtils.HaversineMeters(a[^1], b[0]) < 5 ? 1 : 0;
        return a.Concat(b.Skip(startSlice)).ToList();
    }

    /// <summary>
    /// Build a tricycle <see cref="RouteLeg"/> by requesting the routed path from the
    /// OSRM bicycle/driving backend. Falls back to a straight-line polyline (× 1.2 distance)
    /// when the OSRM call fails.
    /// </summary>
    /// <param name="from">Tricycle pickup coordinate.</param>
    /// <param name="to">Tricycle drop-off coordinate.</param>
    /// <param name="stationName">Station or hailing point name shown in instructions.</param>
    /// <param name="isHail">Whether the boarding is by roadside hailing vs. fixed station.</param>
    /// <param name="config">Routing config supplying the tricycle speed.</param>
    private async Task<RouteLeg> BuildTricycleLegAsync(
        LatLng from, LatLng to, string stationName, bool isHail, RoutingConfig config)
    {
        string polyline;
        double distance;
        double duration;

        try
        {
            var route = await _tricycleClient.RouteAsync(from, to);
            polyline = route.Polyline;
            distance = route.Distance;
            duration = route.Duration;
        }
        catch
        {
            polyline = PolylineCodec.Encode([from, to]);
            distance = GeoUtils.HaversineMeters(from, to) * 1.2;
            duration = Math.Round(distance / GeoUtils.SpeedMps(config.TricycleSpeedKmh));
        }

        return new RouteLeg
        {
            Type = LegType.Tricycle,
            RouteName = stationName,
            RouteId = null,
            RouteNumber = null,
            Polyline = polyline,
            Color = null,
            Distance = distance,
            Duration = duration,
            Fare = Math.Round(config.TricycleFlatFare * 100) / 100,
            Instructions = InstructionGenerator.GenerateTricycleInstructions(stationName, isHail),
            Bbox = GeoUtils.ComputeBbox([from, to]),
        };
    }

    /// <summary>
    /// Build a short tricycle leg used to connect a station to a nearby jeepney boarding node.
    /// Tries the OSRM bicycle/driving backend first; falls back to the OSRM foot geometry
    /// (rescaled to tricycle speed) if the driving detour ratio is too high; falls back
    /// further to a straight-line polyline when both OSRM calls fail.
    /// </summary>
    /// <param name="from">Leg start coordinate (station location).</param>
    /// <param name="to">Leg end coordinate (jeepney boarding node).</param>
    /// <param name="stationName">Station name shown in instructions.</param>
    /// <param name="config">Routing config supplying the tricycle speed.</param>
    private async Task<RouteLeg> BuildLocalTricycleLegAsync(
        LatLng from, LatLng to, string stationName, RoutingConfig config)
    {
        string polyline;
        double distance;
        var straight = GeoUtils.HaversineMeters(from, to);

        // Try OSRM bicycle first; fall back to OSRM foot walking geometry
        try
        {
            var route = await _tricycleClient.RouteAsync(from, to);
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
                var walk = await _walkClient.RouteAsync(from, to);
                polyline = walk.Polyline;
                distance = walk.Distance;
            }
            catch
            {
                polyline = PolylineCodec.Encode([from, to]);
                distance = straight * 1.2;
            }
        }

        var duration = (int)Math.Round(distance / GeoUtils.SpeedMps(config.TricycleSpeedKmh));

        return new RouteLeg
        {
            Type = LegType.Tricycle,
            RouteName = stationName,
            RouteId = null,
            RouteNumber = null,
            Polyline = polyline,
            Color = null,
            Distance = distance,
            Duration = duration,
            Fare = Math.Round(config.TricycleFlatFare * 100) / 100,
            Instructions = InstructionGenerator.GenerateTricycleInstructions(stationName, false),
            Bbox = GeoUtils.ComputeBbox([from, to]),
        };
    }

    /// <summary>
    /// Return the first outgoing edge from <paramref name="fromId"/> to <paramref name="toId"/>,
    /// or <see langword="null"/> when no such edge exists in the costed graph.
    /// </summary>
    private static GraphEdge? FindEdgeBetween(Graph graph, string fromId, string toId)
    {
        return !graph.Edges.TryGetValue(fromId, out var edges)
            ? null
            : edges.Find(e => e.To == toId);
    }
}
