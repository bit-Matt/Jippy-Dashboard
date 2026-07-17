using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Data;
using JippyServices.Algorithm.Navigator.Common;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Navigator.V3.Types;
using JippyServices.Algorithm.Polyline;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using RouteDirection = JippyServices.Algorithm.Navigator.Common.Types.RouteDirection;

namespace JippyServices.Algorithm.Navigator.V3;

/// <summary>
/// Stop-based graph construction for NavigatorV3.
/// Boarding, transfers, and alighting only occur at nodes snapped to public stops.
/// </summary>
internal sealed class GraphBuilderV3
{
    private readonly DataContext _db;
    private readonly IOSRMClient _walk;
    private readonly ITransitDataCacheV3 _cache;
    private readonly IWeightsManager _weights;

    public GraphBuilderV3(
        DataContext db,
        IOSRMClient walk,
        ITransitDataCacheV3 cache,
        IWeightsManager weights)
    {
        _db = db;
        _walk = walk;
        _cache = cache;
        _weights = weights;
    }

    private async Task<TransitDataV3> LoadTransitDataAsync()
    {
        var dbRoutes = await _db.Routes
            .AsNoTracking()
            .Where(r => r.IsPublic && r.ActiveSnapshotId != null)
            .OrderBy(r => r.Id)
            .ToListAsync();

        var routes = dbRoutes.Select(r => new TransitRoute
        {
            Id = r.Id.ToString(),
            RouteNumber = r.RouteNumber,
            RouteName = r.RouteName,
            RouteColor = r.RouteColor,
            FleetCount = r.FleetCount,
            PolylineGoingTo = r.PolylineGoingTo,
            PolylineGoingBack = r.PolylineGoingBack,
            DecodedGoingTo = string.IsNullOrEmpty(r.PolylineGoingTo) ? [] : PolylineCodec.Decode(r.PolylineGoingTo),
            DecodedGoingBack = string.IsNullOrEmpty(r.PolylineGoingBack) ? [] : PolylineCodec.Decode(r.PolylineGoingBack),
        }).ToList();

        // Regions (polygons only — used for Walk/Tricycle labeling, not stations)
        var dbRegions = await _db.Regions
            .AsNoTracking()
            .Where(r => r.IsPublic && r.ActiveSnapshotId != null)
            .OrderBy(r => r.Id)
            .ToListAsync();

        var activeSnapshotIds = dbRegions
            .Where(r => r.ActiveSnapshotId.HasValue)
            .Select(r => r.ActiveSnapshotId!.Value)
            .ToList();

        var snapshots = await _db.RegionSnapshots
            .AsNoTracking()
            .Where(rs => activeSnapshotIds.Contains(rs.Id))
            .OrderBy(rs => rs.Id)
            .ToListAsync();

        var snapshotMap = snapshots.ToDictionary(s => s.Id);

        var regions = dbRegions.Select(r =>
        {
            var snap = r.ActiveSnapshotId.HasValue && snapshotMap.TryGetValue(r.ActiveSnapshotId.Value, out var s)
                ? s
                : null;
            var boundaryPolygon = snap?.Polygon ?? r.Polygon;
            return new TransitRegion
            {
                Id = r.Id.ToString(),
                RegionName = snap?.Name ?? r.Name,
                RegionColor = snap?.Color ?? r.Color,
                RegionShape = snap?.ShapeType ?? r.ShapeType,
                Points = boundaryPolygon != null && boundaryPolygon.ExteriorRing.NumPoints >= 4
                    ? boundaryPolygon.ExteriorRing.Coordinates
                        .Take(boundaryPolygon.ExteriorRing.Coordinates.Length - 1)
                        .Select((coord, i) => new RegionPoint
                        {
                            Id = $"{r.Id}:{i + 1}",
                            Sequence = i + 1,
                            Point = new LatLng(coord.Y, coord.X),
                        })
                        .ToList()
                    : [],
                Stations = [],
            };
        }).ToList();

        var dbClosures = await _db.RoadClosures
            .AsNoTracking()
            .Where(c => c.IsPublic && (c.EndDate == null || c.EndDate > DateTime.UtcNow))
            .OrderBy(c => c.Id)
            .ToListAsync();

        var closures = dbClosures
            .Where(c => c.Polygon != null && c.Polygon.ExteriorRing.NumPoints >= 4)
            .Select(c =>
            {
                var coords = c.Polygon!.ExteriorRing.Coordinates;
                return new TransitClosure
                {
                    Id = c.Id.ToString(),
                    ClosureName = c.Name,
                    Points = coords
                        .Take(coords.Length - 1)
                        .Select((coord, i) => new RegionPoint
                        {
                            Id = $"{c.Id}:{i}",
                            Sequence = i,
                            Point = new LatLng(coord.Y, coord.X),
                        })
                        .ToList(),
                };
            })
            .ToList();

        var dbStops = await _db.Stops
            .AsNoTracking()
            .Where(s => s.IsPublic && s.Point != null)
            .OrderBy(s => s.Number)
            .ToListAsync();

        var stops = dbStops
            .Select(s => new StopPoint
            {
                Id = s.Id.ToString(),
                Number = s.Number,
                Address = s.Address,
                Point = GeoUtils.ToLatLng(s.Point!),
            })
            .ToList();

        return new TransitDataV3
        {
            Routes = routes,
            Regions = regions,
            Closures = closures,
            Stops = stops,
        };
    }

    private static Dictionary<string, GraphNode> BuildGraphNodes(List<TransitRoute> routes)
    {
        var nodes = new Dictionary<string, GraphNode>();
        foreach (var route in routes)
        {
            AddDirectionNodes(nodes, route, RouteDirection.GoingTo, route.DecodedGoingTo);
            AddDirectionNodes(nodes, route, RouteDirection.GoingBack, route.DecodedGoingBack);
        }
        return nodes;
    }

    private static void AddDirectionNodes(
        Dictionary<string, GraphNode> nodes,
        TransitRoute route,
        RouteDirection direction,
        List<LatLng> coords)
    {
        if (coords.Count < 2) return;
        var dirStr = direction == RouteDirection.GoingTo ? "goingTo" : "goingBack";

        for (var i = 0; i < coords.Count; i++)
        {
            var id = $"{route.Id}:{dirStr}:{i}";
            nodes[id] = new GraphNode
            {
                Id = id,
                Lat = coords[i].Lat,
                Lng = coords[i].Lng,
                RouteId = route.Id,
                RouteName = route.RouteName,
                RouteNumber = route.RouteNumber,
                RouteColor = route.RouteColor,
                Direction = direction,
                PolylineIndex = i,
            };
        }
    }

    /// <summary>
    /// Associate public stops to the nearest polyline vertex (via segment projection)
    /// within <see cref="RoutingConfig.StopSnapMeters"/>. One boarding node per
    /// (route, direction, stop).
    /// </summary>
    private static Dictionary<string, StopPoint> BuildBoardingNodes(
        List<TransitRoute> routes,
        List<StopPoint> stops,
        Dictionary<string, GraphNode> nodes,
        RoutingConfig config)
    {
        var boarding = new Dictionary<string, StopPoint>();
        if (stops.Count == 0) return boarding;

        var stopIndex = new GridIndex(config.StopSnapMeters);
        foreach (var stop in stops)
            stopIndex.Insert(stop.Id, stop.Point.Lat, stop.Point.Lng);

        var stopById = stops.ToDictionary(s => s.Id);
        var nearbyBuffer = new List<string>(32);

        foreach (var route in routes)
        {
            SnapDirection(route, RouteDirection.GoingTo, route.DecodedGoingTo, nodes, stopIndex, stopById, nearbyBuffer, boarding, config);
            SnapDirection(route, RouteDirection.GoingBack, route.DecodedGoingBack, nodes, stopIndex, stopById, nearbyBuffer, boarding, config);
        }

        return boarding;
    }

    private static void SnapDirection(
        TransitRoute route,
        RouteDirection direction,
        List<LatLng> coords,
        Dictionary<string, GraphNode> nodes,
        GridIndex stopIndex,
        Dictionary<string, StopPoint> stopById,
        List<string> nearbyBuffer,
        Dictionary<string, StopPoint> boarding,
        RoutingConfig config)
    {
        if (coords.Count < 2) return;
        var dirStr = direction == RouteDirection.GoingTo ? "goingTo" : "goingBack";

        // Best (vertexIndex, dist) per stop for this route+direction
        var bestPerStop = new Dictionary<string, (int VertexIndex, double Dist)>();

        // For each vertex, consider nearby stops against adjacent segments only
        // (avoids O(vertices × nearby × polylineLength) full-polyline scans).
        for (var i = 0; i < coords.Count; i++)
        {
            nearbyBuffer.Clear();
            stopIndex.QueryNearby(coords[i].Lat, coords[i].Lng, config.StopSnapMeters, nearbyBuffer);

            foreach (var stopId in nearbyBuffer)
            {
                if (!stopById.TryGetValue(stopId, out var stop)) continue;

                double bestDist = double.MaxValue;
                var bestVertex = i;

                if (i > 0)
                {
                    var (d, t) = DistanceToSegmentWithT(stop.Point, coords[i - 1], coords[i]);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        bestVertex = t < 0.5 ? i - 1 : i;
                    }
                }

                if (i < coords.Count - 1)
                {
                    var (d, t) = DistanceToSegmentWithT(stop.Point, coords[i], coords[i + 1]);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        bestVertex = t < 0.5 ? i : i + 1;
                    }
                }

                if (bestDist > config.StopSnapMeters) continue;

                if (!bestPerStop.TryGetValue(stopId, out var existing) || bestDist < existing.Dist)
                    bestPerStop[stopId] = (bestVertex, bestDist);
            }
        }

        // Drop parallel-road / cross-corridor false positives: a stop whose
        // projection is clearly farther from the polyline than a nearby stop
        // (e.g. East Service Road vs Aquino Ave) must not claim a boarding node.
        // Require a meaningful offset (≥15 m) so consecutive on-route stops a
        // few centimetres apart are not eliminated by float noise.
        const double minOffsetMeters = 15;
        var neighborRadius = config.StopSnapMeters * 1.5;
        var eligible = new List<(string StopId, int VertexIndex, double Dist)>(bestPerStop.Count);
        foreach (var (stopId, (vertexIndex, dist)) in bestPerStop)
        {
            if (dist < minOffsetMeters)
            {
                eligible.Add((stopId, vertexIndex, dist));
                continue;
            }

            var point = stopById[stopId].Point;
            var dominated = false;
            foreach (var (otherId, (_, otherDist)) in bestPerStop)
            {
                if (otherId == stopId) continue;
                if (otherDist >= dist) continue;
                if (GeoUtils.HaversineMeters(point, stopById[otherId].Point) > neighborRadius)
                    continue;
                dominated = true;
                break;
            }
            if (!dominated)
                eligible.Add((stopId, vertexIndex, dist));
        }

        // Closest-to-polyline wins when multiple stops collapse onto one vertex.
        var bestPerVertex = new Dictionary<int, (string StopId, double Dist)>();
        foreach (var (stopId, vertexIndex, dist) in eligible)
        {
            if (!bestPerVertex.TryGetValue(vertexIndex, out var existing) || dist < existing.Dist)
                bestPerVertex[vertexIndex] = (stopId, dist);
        }

        foreach (var (vertexIndex, (stopId, _)) in bestPerVertex)
        {
            var nodeId = $"{route.Id}:{dirStr}:{vertexIndex}";
            if (!nodes.ContainsKey(nodeId)) continue;
            boarding[nodeId] = stopById[stopId];
        }
    }

    private static (double Dist, double T) DistanceToSegmentWithT(LatLng p, LatLng a, LatLng b)
    {
        var dx = b.Lng - a.Lng;
        var dy = b.Lat - a.Lat;
        var lenSq = dx * dx + dy * dy;

        if (lenSq == 0)
            return (GeoUtils.HaversineMeters(p, a), 0);

        var t = Math.Clamp(((p.Lng - a.Lng) * dx + (p.Lat - a.Lat) * dy) / lenSq, 0, 1);
        var nearest = new LatLng(a.Lat + t * dy, a.Lng + t * dx);
        return (GeoUtils.HaversineMeters(p, nearest), t);
    }

    private static Dictionary<string, double> ComputeRawBoardingCosts(List<TransitRoute> routes)
    {
        var costs = new Dictionary<string, double>();
        foreach (var route in routes)
        {
            var goingToDist = GeoUtils.PolylineDistance(route.DecodedGoingTo);
            var goingBackDist = GeoUtils.PolylineDistance(route.DecodedGoingBack);
            var roundTripDist = goingToDist + goingBackDist;
            var fleetCount = Math.Max(route.FleetCount, 1);
            costs[route.Id] = roundTripDist / fleetCount / 2;
        }
        return costs;
    }

    private static Dictionary<string, List<BaseEdge>> BuildBaseTransitEdges(
        List<TransitRoute> routes,
        Dictionary<string, GraphNode> nodes)
    {
        var adjacency = new Dictionary<string, List<BaseEdge>>();

        foreach (var route in routes)
        {
            AddBaseDirectionEdges(adjacency, route, RouteDirection.GoingTo, route.DecodedGoingTo);
            AddBaseDirectionEdges(adjacency, route, RouteDirection.GoingBack, route.DecodedGoingBack);
        }

        foreach (var nodeId in nodes.Keys)
            adjacency.TryAdd(nodeId, []);

        return adjacency;
    }

    private static void AddBaseDirectionEdges(
        Dictionary<string, List<BaseEdge>> adjacency,
        TransitRoute route,
        RouteDirection direction,
        List<LatLng> coords)
    {
        if (coords.Count < 2) return;
        var dirStr = direction == RouteDirection.GoingTo ? "goingTo" : "goingBack";

        for (var i = 0; i < coords.Count - 1; i++)
        {
            var fromId = $"{route.Id}:{dirStr}:{i}";
            var toId = $"{route.Id}:{dirStr}:{i + 1}";
            var dist = GeoUtils.HaversineMeters(coords[i], coords[i + 1]);

            if (!adjacency.TryGetValue(fromId, out var edges))
            {
                edges = [];
                adjacency[fromId] = edges;
            }

            edges.Add(new BaseEdge
            {
                From = fromId,
                To = toId,
                Distance = dist,
                Type = EdgeType.Transit,
                RouteId = route.Id,
                RouteName = route.RouteName,
            });
        }
    }

    /// <summary>
    /// Transfer edges only between boarding-node pairs of different routes.
    /// </summary>
    private static void BuildBaseTransferEdges(
        Dictionary<string, StopPoint> boardingNodes,
        Dictionary<string, GraphNode> nodes,
        Dictionary<string, List<BaseEdge>> baseEdges,
        RoutingConfig config)
    {
        if (boardingNodes.Count == 0) return;

        var index = new GridIndex(config.TransferProximityMeters);
        foreach (var nodeId in boardingNodes.Keys)
        {
            if (!nodes.TryGetValue(nodeId, out var node)) continue;
            index.Insert(nodeId, node.Lat, node.Lng);
        }

        var nearbyBuffer = new List<string>(64);

        foreach (var (nodeId, _) in boardingNodes)
        {
            if (!nodes.TryGetValue(nodeId, out var node)) continue;

            nearbyBuffer.Clear();
            index.QueryNearby(node.Lat, node.Lng, config.TransferProximityMeters, nearbyBuffer);

            var bestPerRoute = new Dictionary<(string, RouteDirection), (string OtherId, double Dist)>();

            foreach (var otherId in nearbyBuffer)
            {
                if (otherId == nodeId) continue;
                if (!boardingNodes.ContainsKey(otherId)) continue;
                if (!nodes.TryGetValue(otherId, out var other)) continue;
                if (node.RouteId == other.RouteId) continue;

                var dist = GeoUtils.HaversineMeters(
                    new LatLng(node.Lat, node.Lng),
                    new LatLng(other.Lat, other.Lng));
                if (dist > config.TransferProximityMeters) continue;

                var key = (other.RouteId, other.Direction);
                if (!bestPerRoute.TryGetValue(key, out var existing) || dist < existing.Dist)
                    bestPerRoute[key] = (otherId, dist);
            }

            foreach (var (_, (otherId, dist)) in bestPerRoute)
            {
                var other = nodes[otherId];
                AddBaseEdgeIfAbsent(baseEdges, new BaseEdge
                {
                    From = nodeId,
                    To = otherId,
                    Distance = dist,
                    TransferWalkDist = dist,
                    Type = EdgeType.Transfer,
                    RouteId = other.RouteId,
                    RouteName = other.RouteName,
                });
            }
        }
    }

    private static void AddBaseEdgeIfAbsent(Dictionary<string, List<BaseEdge>> adj, BaseEdge edge)
    {
        if (!adj.TryGetValue(edge.From, out var edges))
        {
            edges = [];
            adj[edge.From] = edges;
        }
        if (edges.All(e => e.To != edge.To))
            edges.Add(edge);
    }

    private static void MarkClosureEdges(
        Dictionary<string, List<BaseEdge>> baseEdges,
        Dictionary<string, GraphNode> nodes,
        List<TransitClosure> closures)
    {
        if (closures.Count == 0) return;

        var factory = NetTopologySuite.NtsGeometryServices.Instance.CreateGeometryFactory(4326);

        var closurePolygons = closures
            .Where(c => c.Points.Count >= 3)
            .Select(c =>
            {
                var sorted = c.Points.OrderBy(p => p.Sequence).ToList();
                var ring = sorted.Select(p => new Coordinate(p.Point.Lng, p.Point.Lat)).ToList();
                ring.Add(ring[0]);
                return factory.CreatePolygon(ring.ToArray());
            })
            .Where(p => p.IsValid)
            .ToList();

        if (closurePolygons.Count == 0) return;

        foreach (var (_, edges) in baseEdges)
        {
            foreach (var edge in edges)
            {
                if (edge.Type != EdgeType.Transit) continue;
                if (!nodes.TryGetValue(edge.From, out var fromNode)) continue;
                if (!nodes.TryGetValue(edge.To, out var toNode)) continue;

                var segment = factory.CreateLineString([
                    new Coordinate(fromNode.Lng, fromNode.Lat),
                    new Coordinate(toNode.Lng, toNode.Lat)
                ]);

                var midPoint = factory.CreatePoint(new Coordinate(
                    (fromNode.Lng + toNode.Lng) / 2,
                    (fromNode.Lat + toNode.Lat) / 2));

                foreach (var poly in closurePolygons)
                {
                    if (segment.Intersects(poly) || poly.Contains(midPoint))
                    {
                        edge.ClosureAffected = true;
                        break;
                    }
                }
            }
        }
    }

    internal static bool IsInsideAnyRegion(LatLng point, List<TransitRegion> regions)
    {
        if (regions.Count == 0) return false;
        var factory = NetTopologySuite.NtsGeometryServices.Instance.CreateGeometryFactory(4326);
        var pt = factory.CreatePoint(new Coordinate(point.Lng, point.Lat));

        foreach (var region in regions)
        {
            var poly = BuildRegionPolygon(factory, region);
            if (poly != null && poly.Contains(pt))
                return true;
        }

        return false;
    }

    private static Polygon? BuildRegionPolygon(GeometryFactory factory, TransitRegion region)
    {
        var sorted = region.Points.OrderBy(p => p.Sequence).ToList();
        if (sorted.Count < 3) return null;
        var ring = sorted.Select(p => new Coordinate(p.Point.Lng, p.Point.Lat)).ToList();
        ring.Add(ring[0]);
        return factory.CreatePolygon(ring.ToArray());
    }

    private async Task<(Dictionary<string, double> Access, Dictionary<string, double> Egress)>
        QueryUserNodeDistancesAsync(
            LatLng start,
            LatLng end,
            Dictionary<string, StopPoint> boardingNodes,
            Dictionary<string, GraphNode> nodes,
            RoutingConfig config)
    {
        nodes[RoutingConstants.VirtualStartId] = new GraphNode
        {
            Id = RoutingConstants.VirtualStartId,
            Lat = start.Lat,
            Lng = start.Lng,
            RouteId = "__virtual__",
            RouteName = "",
            RouteNumber = "",
            RouteColor = "",
            Direction = RouteDirection.GoingTo,
            PolylineIndex = -1,
        };

        nodes[RoutingConstants.VirtualEndId] = new GraphNode
        {
            Id = RoutingConstants.VirtualEndId,
            Lat = end.Lat,
            Lng = end.Lng,
            RouteId = "__virtual__",
            RouteName = "",
            RouteNumber = "",
            RouteColor = "",
            Direction = RouteDirection.GoingTo,
            PolylineIndex = -1,
        };

        var accessDegThreshold = config.MaxTransitProximityMeters / 111_320.0;
        var candidatesByGroup = new Dictionary<string, List<(string NodeId, double GeoDist)>>();

        foreach (var (nodeId, stop) in boardingNodes)
        {
            if (!nodes.TryGetValue(nodeId, out var node)) continue;
            // Prefer the real stop coordinate for proximity / walk distance.
            var stopPt = stop.Point;
            if (Math.Abs(stopPt.Lat - start.Lat) > accessDegThreshold) continue;
            if (Math.Abs(stopPt.Lng - start.Lng) > accessDegThreshold * 1.5) continue;

            var dist = GeoUtils.HaversineMeters(stopPt, start);
            if (dist > config.MaxTransitProximityMeters) continue;

            var dirStr = node.Direction == RouteDirection.GoingTo ? "goingTo" : "goingBack";
            var groupKey = $"{node.RouteId}:{dirStr}";
            if (!candidatesByGroup.TryGetValue(groupKey, out var group))
            {
                group = [];
                candidatesByGroup[groupKey] = group;
            }
            group.Add((nodeId, dist));
        }

        var accessCandidates = new List<(string NodeId, double GeoDist)>();
        foreach (var (_, group) in candidatesByGroup)
        {
            group.Sort((a, b) => a.GeoDist.CompareTo(b.GeoDist));
            accessCandidates.AddRange(group.Take(config.AccessCandidatesPerDirection));
        }
        accessCandidates.Sort((a, b) =>
        {
            var c = a.GeoDist.CompareTo(b.GeoDist);
            return c != 0 ? c : string.Compare(a.NodeId, b.NodeId, StringComparison.Ordinal);
        });
        var cappedAccess = accessCandidates.Take(config.MaxAccessQueries).ToList();

        var accessTasks = cappedAccess.Select(async c =>
        {
            var stopPt = boardingNodes[c.NodeId].Point;
            var d = await _walk.DistanceAsync(start, stopPt);
            return (c.NodeId, Dist: double.IsPositiveInfinity(d) ? c.GeoDist * 1.4 : d);
        });

        var accessResults = await Task.WhenAll(accessTasks);
        var accessDistances = new Dictionary<string, double>();
        foreach (var (nodeId, dist) in accessResults)
        {
            if (double.IsFinite(dist))
                accessDistances[nodeId] = dist;
        }

        var egressDegThreshold = config.MaxTransitProximityMeters / 111_320.0;
        var egressByGroup = new Dictionary<string, List<(string NodeId, double GeoDist)>>();

        foreach (var (nodeId, stop) in boardingNodes)
        {
            if (!nodes.TryGetValue(nodeId, out var node)) continue;
            var stopPt = stop.Point;
            if (Math.Abs(stopPt.Lat - end.Lat) > egressDegThreshold) continue;
            if (Math.Abs(stopPt.Lng - end.Lng) > egressDegThreshold * 1.5) continue;

            var dist = GeoUtils.HaversineMeters(stopPt, end);
            if (dist > config.MaxTransitProximityMeters) continue;

            var dirStr = node.Direction == RouteDirection.GoingTo ? "goingTo" : "goingBack";
            var groupKey = $"{node.RouteId}:{dirStr}";
            if (!egressByGroup.TryGetValue(groupKey, out var group))
            {
                group = [];
                egressByGroup[groupKey] = group;
            }
            group.Add((nodeId, dist));
        }

        var egressCandidates = new List<(string NodeId, double GeoDist)>();
        foreach (var (_, group) in egressByGroup)
        {
            group.Sort((a, b) => a.GeoDist.CompareTo(b.GeoDist));
            egressCandidates.AddRange(group.Take(config.EgressCandidatesPerDirection));
        }
        egressCandidates.Sort((a, b) =>
        {
            var c = a.GeoDist.CompareTo(b.GeoDist);
            return c != 0 ? c : string.Compare(a.NodeId, b.NodeId, StringComparison.Ordinal);
        });
        var cappedEgress = egressCandidates.Take(config.MaxEgressQueries).ToList();

        var egressTasks = cappedEgress.Select(async c =>
        {
            var stopPt = boardingNodes[c.NodeId].Point;
            var d = await _walk.DistanceAsync(stopPt, end);
            return (c.NodeId, Dist: double.IsPositiveInfinity(d) ? c.GeoDist * 1.4 : d);
        });

        var egressResults = await Task.WhenAll(egressTasks);
        var egressDistances = new Dictionary<string, double>();
        foreach (var (nodeId, dist) in egressResults)
        {
            if (double.IsFinite(dist))
                egressDistances[nodeId] = dist;
        }

        return (accessDistances, egressDistances);
    }

    public static Dictionary<string, List<GraphEdge>> BuildCostedAdjacency(
        Dictionary<string, List<BaseEdge>> baseEdges,
        Dictionary<string, double> rawBoardingCosts,
        Dictionary<string, double> accessDistances,
        Dictionary<string, double> egressDistances,
        Dictionary<string, GraphNode> nodes,
        Dictionary<string, StopPoint> boardingNodes,
        WeightProfile profile,
        RoutingConfig? config = null)
    {
        var cfg = config ?? RoutingConfig.FromWeights(AlgorithmWeights.Defaults);
        var adjacency = new Dictionary<string, List<GraphEdge>>();

        foreach (var (nodeId, edges) in baseEdges)
        {
            var costed = new List<GraphEdge>(edges.Count);

            foreach (var baseEdge in edges)
            {
                // Transfers only from boarding nodes
                if (baseEdge.Type == EdgeType.Transfer && !boardingNodes.ContainsKey(baseEdge.From))
                    continue;

                double cost;
                switch (baseEdge.Type)
                {
                    case EdgeType.Transit:
                        cost = baseEdge.Distance * profile.TransitCostFactor;
                        if (profile.PenalizedRouteIds?.Contains(baseEdge.RouteId!) == true)
                            cost *= profile.DiversityPenalty ?? 1;
                        if (baseEdge.ClosureAffected)
                            cost *= profile.ClosurePenaltyMultiplier;
                        cost += (baseEdge.Distance / 1000.0) * cfg.JeepneyFarePerKm * cfg.FareCostWeight;
                        break;

                    case EdgeType.Transfer:
                    {
                        var walkCost = (baseEdge.TransferWalkDist ?? baseEdge.Distance) * profile.WalkPenaltyMultiplier;
                        rawBoardingCosts.TryGetValue(baseEdge.RouteId ?? "", out var rawBc);
                        var boardingCost = rawBc * profile.BoardingCostFactor;
                        cost = walkCost + profile.TransferPenaltyMeters + boardingCost;
                        cost += FareUtils.FareToCostMeters(cfg.JeepneyBaseFare, cfg);
                        break;
                    }

                    default:
                    {
                        var effectiveDist = baseEdge.Distance;
                        if (baseEdge.DetourRatio is > 1)
                            effectiveDist *= Math.Min(baseEdge.DetourRatio.Value, cfg.BacktrackPenaltyMultiplier);
                        cost = GeoUtils.ProfileWalkCost(effectiveDist, profile);
                        break;
                    }
                }

                costed.Add(new GraphEdge
                {
                    From = baseEdge.From,
                    To = baseEdge.To,
                    Distance = baseEdge.Distance,
                    Cost = cost,
                    Type = baseEdge.Type,
                    RouteId = baseEdge.RouteId,
                    RouteName = baseEdge.RouteName,
                });
            }

            adjacency[nodeId] = costed;
        }

        if (!adjacency.TryGetValue(RoutingConstants.VirtualStartId, out var existingStartEdges))
        {
            existingStartEdges = [];
            adjacency[RoutingConstants.VirtualStartId] = existingStartEdges;
        }

        foreach (var (nodeId, rawDist) in accessDistances)
        {
            if (!boardingNodes.ContainsKey(nodeId)) continue;
            if (!nodes.TryGetValue(nodeId, out var node)) continue;

            var walkCost = GeoUtils.ProfileWalkCost(rawDist, profile);
            rawBoardingCosts.TryGetValue(node.RouteId, out var bc);
            var boardingCost = bc * profile.BoardingCostFactor;
            existingStartEdges.Add(new GraphEdge
            {
                From = RoutingConstants.VirtualStartId,
                To = nodeId,
                Distance = rawDist,
                Cost = walkCost + boardingCost + FareUtils.FareToCostMeters(cfg.JeepneyBaseFare, cfg),
                Type = EdgeType.Walk,
                RouteId = node.RouteId,
                RouteName = node.RouteName,
            });
        }

        foreach (var (nodeId, rawDist) in egressDistances)
        {
            if (!boardingNodes.ContainsKey(nodeId)) continue;
            var walkCost = GeoUtils.ProfileWalkCost(rawDist, profile);
            if (!adjacency.TryGetValue(nodeId, out var nodeEdges))
            {
                nodeEdges = [];
                adjacency[nodeId] = nodeEdges;
            }
            nodeEdges.Add(new GraphEdge
            {
                From = nodeId,
                To = RoutingConstants.VirtualEndId,
                Distance = rawDist,
                Cost = walkCost,
                Type = EdgeType.Walk,
            });
        }

        adjacency.TryAdd(RoutingConstants.VirtualEndId, []);
        return adjacency;
    }

    private async Task<CachedStaticGraphV3?> GetStaticGraphAsync()
    {
        var config = _weights.GetConfig();

        return await _cache.GetOrBuildAsync(async () =>
        {
            var data = await LoadTransitDataAsync();
            if (data.Routes.Count == 0) return null;

            var nodes = BuildGraphNodes(data.Routes);
            var boardingNodes = BuildBoardingNodes(data.Routes, data.Stops, nodes, config);
            if (boardingNodes.Count == 0) return null;

            var baseEdges = BuildBaseTransitEdges(data.Routes, nodes);
            BuildBaseTransferEdges(boardingNodes, nodes, baseEdges, config);
            MarkClosureEdges(baseEdges, nodes, data.Closures);
            var rawBoardingCosts = ComputeRawBoardingCosts(data.Routes);

            return new CachedStaticGraphV3
            {
                TransitData = data,
                Nodes = nodes,
                BaseEdges = baseEdges,
                RawBoardingCosts = rawBoardingCosts,
                BoardingNodes = boardingNodes,
            };
        });
    }

    public async Task<(BaseGraphV3 Graph, TransitDataV3 Data)?> BuildBaseGraphAsync(
        LatLng start, LatLng end, RoutingConfig? config = null)
    {
        var cfg = config ?? _weights.GetConfig();
        var staticGraph = await GetStaticGraphAsync();
        if (staticGraph == null) return null;

        var nodes = new Dictionary<string, GraphNode>(staticGraph.Nodes);
        var baseEdges = staticGraph.BaseEdges
            .ToDictionary(kv => kv.Key, kv => new List<BaseEdge>(kv.Value));

        var (accessDistances, egressDistances) = await QueryUserNodeDistancesAsync(
            start, end, staticGraph.BoardingNodes, nodes, cfg);

        // Filter access/egress to boarding nodes only (already done in query, but keep consistent)
        accessDistances = accessDistances
            .Where(kv => staticGraph.BoardingNodes.ContainsKey(kv.Key))
            .ToDictionary(kv => kv.Key, kv => kv.Value);
        egressDistances = egressDistances
            .Where(kv => staticGraph.BoardingNodes.ContainsKey(kv.Key))
            .ToDictionary(kv => kv.Key, kv => kv.Value);

        var startInRegion = IsInsideAnyRegion(start, staticGraph.TransitData.Regions);
        var endInRegion = IsInsideAnyRegion(end, staticGraph.TransitData.Regions);

        var baseGraph = new BaseGraphV3
        {
            Nodes = nodes,
            BaseEdges = baseEdges,
            RawBoardingCosts = staticGraph.RawBoardingCosts,
            AccessWalkDistances = accessDistances,
            EgressWalkDistances = egressDistances,
            HasAccessEdges = accessDistances.Count > 0,
            HasEgressEdges = egressDistances.Count > 0,
            BoardingNodes = staticGraph.BoardingNodes,
            StartInRegion = startInRegion,
            EndInRegion = endInRegion,
        };

        return (baseGraph, staticGraph.TransitData);
    }
}
