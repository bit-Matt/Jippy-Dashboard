using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Contracts.V2.Responses;
using JippyServices.Algorithm.Navigator.Common;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Navigator.V2;
using JippyServices.Algorithm.Navigator.V3.Types;
using JippyServices.Algorithm.Polyline;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Navigator.V3;

/// <summary>
/// Assembles RouteLegs from A* paths for NavigatorV3 (no tricycle ride legs).
/// Access/egress walks may be labeled <see cref="LegType.WalkTricycle"/> when
/// the origin/destination lies inside a tricycle region.
/// </summary>
internal sealed class LegAssemblerV3
{
    private readonly IOSRMClient _walkClient;
    private readonly InstructionGenerator _instructions;

    public LegAssemblerV3(INominatimServiceClient nominatim, IOSRMClient walkClient)
    {
        _instructions = new InstructionGenerator(nominatim);
        _walkClient = walkClient;
    }

    private static bool IsWalkLike(LegType type)
        => type is LegType.Walk or LegType.WalkTricycle;

    public async Task<List<RouteLeg>> BuildWalkOnlyRouteAsync(
        LatLng from, LatLng to, bool useWalkTricycleLabel)
    {
        var walk = await _walkClient.RouteAsync(from, to);
        var instr = InstructionGenerator.GenerateWalkInstructions(walk.Maneuvers);
        var bbox = GeoUtils.ComputeBbox([from, to]);

        return
        [
            new RouteLeg
            {
                Type = useWalkTricycleLabel ? LegType.WalkTricycle : LegType.Walk,
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
                i++;
            }
            else
            {
                i++;
            }
        }

        return sections;
    }

    public async Task<List<RouteLeg>> BuildLegsFromSectionsAsync(
        List<PathSection> sections,
        RoutingConfig config,
        bool startInRegion,
        bool endInRegion,
        Dictionary<string, StopPoint>? boardingNodes = null)
    {
        boardingNodes ??= new Dictionary<string, StopPoint>();
        var legs = new List<RouteLeg>();

        for (var i = 0; i < sections.Count; i++)
        {
            var section = sections[i];

            switch (section)
            {
                case WalkSection walk:
                {
                    var from = ResolvePoint(walk.FromNode, boardingNodes);
                    var to = ResolvePoint(walk.ToNode, boardingNodes);
                    if (GeoUtils.HaversineMeters(from, to) < 1) continue;

                    var isAccess = walk.FromNode.Id == RoutingConstants.VirtualStartId;
                    var isEgress = walk.ToNode.Id == RoutingConstants.VirtualEndId;
                    var walkType = (isAccess && startInRegion) || (isEgress && endInRegion)
                        ? LegType.WalkTricycle
                        : LegType.Walk;

                    var walkRoute = await _walkClient.RouteAsync(from, to);
                    legs.Add(new RouteLeg
                    {
                        Type = walkType,
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

                case TransitSection transit:
                {
                    if (transit.Nodes.Count < 2) continue;

                    var coords = transit.Nodes.Select(n => new LatLng(n.Lat, n.Lng)).ToList();
                    // Pin board/alight ends to stop coords only when the stop is near the
                    // polyline vertex — avoids drawing a diagonal "cross snap" across
                    // parallel roads when association is slightly off.
                    const double pinMaxMeters = 25;
                    if (boardingNodes.TryGetValue(transit.Nodes[0].Id, out var boardStop)
                        && GeoUtils.HaversineMeters(coords[0], boardStop.Point) <= pinMaxMeters)
                        coords[0] = boardStop.Point;
                    if (boardingNodes.TryGetValue(transit.Nodes[^1].Id, out var alightStop)
                        && GeoUtils.HaversineMeters(coords[^1], alightStop.Point) <= pinMaxMeters)
                        coords[^1] = alightStop.Point;

                    var polyline = PolylineCodec.Encode(coords);

                    double distance = 0;
                    for (var j = 0; j < coords.Count - 1; j++)
                        distance += GeoUtils.HaversineMeters(coords[j], coords[j + 1]);

                    var duration = (int)Math.Round(distance / GeoUtils.SpeedMps(config.JeepneySpeedKmh));

                    // Instruction reverse-geocode should also use stop coordinates.
                    var instrNodes = CloneNodesWithStopEnds(transit.Nodes, boardingNodes);
                    var segment = new PathSegment
                    {
                        RouteId = transit.RouteId,
                        Direction = transit.Direction,
                        RouteName = transit.RouteName,
                        RouteColor = transit.RouteColor,
                        Nodes = instrNodes,
                    };
                    var instr = await _instructions.GenerateJeepneyInstructionsAsync(segment, distance);

                    if (i < sections.Count - 1 && sections[i + 1] is TransitSection nextTransit
                        && nextTransit.RouteId != transit.RouteId)
                    {
                        instr.Add(InstructionGenerator.GenerateTransferInstruction(
                            transit.RouteName, nextTransit.RouteName));
                    }

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
                        Bbox = GeoUtils.ComputeBbox(coords),
                    });
                    break;
                }
            }
        }

        return await FillLegGapsAsync(legs, config);
    }

    /// <summary>
    /// Prefer the snapped public stop coordinate when the graph node is a boarding node.
    /// </summary>
    private static LatLng ResolvePoint(GraphNode node, Dictionary<string, StopPoint> boardingNodes)
    {
        if (boardingNodes.TryGetValue(node.Id, out var stop))
            return stop.Point;
        return new LatLng(node.Lat, node.Lng);
    }

    private static List<GraphNode> CloneNodesWithStopEnds(
        List<GraphNode> nodes, Dictionary<string, StopPoint> boardingNodes)
    {
        var cloned = new List<GraphNode>(nodes.Count);
        for (var i = 0; i < nodes.Count; i++)
        {
            var n = nodes[i];
            if ((i == 0 || i == nodes.Count - 1)
                && boardingNodes.TryGetValue(n.Id, out var stop))
            {
                cloned.Add(new GraphNode
                {
                    Id = n.Id,
                    Lat = stop.Point.Lat,
                    Lng = stop.Point.Lng,
                    RouteId = n.RouteId,
                    RouteName = n.RouteName,
                    RouteNumber = n.RouteNumber,
                    RouteColor = n.RouteColor,
                    Direction = n.Direction,
                    PolylineIndex = n.PolylineIndex,
                });
            }
            else
            {
                cloned.Add(n);
            }
        }
        return cloned;
    }

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

            if (IsWalkLike(leg.Type))
            {
                var mergedCoords = IsWalkLike(prevLeg.Type)
                    ? JoinPolylines(JoinPolylines(prevCoords, glueCoords), currCoords)
                    : JoinPolylines(glueCoords, currCoords);

                var mergedInstructions = IsWalkLike(prevLeg.Type)
                    ? prevLeg.Instructions
                        .Where(ins => ins.ManeuverType != ManeuverType.Arrive)
                        .Concat(filteredGlue)
                        .Concat(leg.Instructions)
                        .ToList()
                    : [.. filteredGlue, .. leg.Instructions];

                var mergedBbox = IsWalkLike(prevLeg.Type)
                    ? GeoUtils.MergeBbox(GeoUtils.MergeBbox(prevLeg.Bbox, GeoUtils.ComputeBbox(glueCoords)), leg.Bbox)
                    : GeoUtils.MergeBbox(GeoUtils.ComputeBbox(glueCoords), leg.Bbox);

                var mergedWalk = new RouteLeg
                {
                    Type = leg.Type,
                    RouteName = null,
                    RouteId = null,
                    RouteNumber = null,
                    Polyline = PolylineCodec.Encode(mergedCoords),
                    Color = null,
                    Distance = (IsWalkLike(prevLeg.Type) ? prevLeg.Distance : 0) + glueDistance + leg.Distance,
                    Duration = (IsWalkLike(prevLeg.Type) ? prevLeg.Duration : 0) + glueDuration + leg.Duration,
                    Fare = 0,
                    Instructions = mergedInstructions,
                    Bbox = mergedBbox,
                };

                if (IsWalkLike(prevLeg.Type))
                    result[^1] = mergedWalk;
                else
                    result.Add(mergedWalk);
            }
            else if (IsWalkLike(prevLeg.Type))
            {
                var mergedCoords = JoinPolylines(prevCoords, glueCoords);
                var mergedInstructions = prevLeg.Instructions
                    .Where(ins => ins.ManeuverType != ManeuverType.Arrive)
                    .Concat(filteredGlue)
                    .ToList();

                result[^1] = new RouteLeg
                {
                    Type = prevLeg.Type,
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
                    Bbox = GeoUtils.ComputeBbox(glueCoords),
                });
                result.Add(leg);
            }
        }

        return result;
    }

    private static List<LatLng> JoinPolylines(List<LatLng> a, List<LatLng> b)
    {
        if (a.Count == 0) return b;
        if (b.Count == 0) return a;
        var startSlice = GeoUtils.HaversineMeters(a[^1], b[0]) < 5 ? 1 : 0;
        return a.Concat(b.Skip(startSlice)).ToList();
    }

    private static GraphEdge? FindEdgeBetween(Graph graph, string fromId, string toId)
    {
        return !graph.Edges.TryGetValue(fromId, out var edges)
            ? null
            : edges.Find(e => e.To == toId);
    }
}
