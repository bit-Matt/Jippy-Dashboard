using JippyServices.Algorithm.Data;
using JippyServices.Algorithm.Navigator.Clients;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace JippyServices.Algorithm.Navigator;

/// <summary>
/// Dynamic graph construction from transit data.
/// </summary>
public sealed class GraphBuilder(DataContext db, GraphHopperClient graphHopper, TransitDataCache transitCache)
{
    /// <summary>
    /// Load transit data from database
    /// </summary>
    /// <returns></returns>
    private async Task<TransitData> LoadTransitDataAsync()
    {
        // Public-viewable routes with an active snapshot
        var dbRoutes = await db.Routes
            .AsNoTracking()
            .Where(r => r.IsPublic && r.ActiveSnapshotId != null)
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

        // Regions with active snapshot, including sequences and stations
        var dbRegions = await db.RegionMarkers
            .AsNoTracking()
            .Where(r => r.IsPublic && r.ActiveSnapshotId != null)
            .ToListAsync();

        var activeSnapshotIds = dbRegions
            .Where(r => r.ActiveSnapshotId.HasValue)
            .Select(r => r.ActiveSnapshotId!.Value)
            .ToList();

        var snapshots = await db.RegionSnapshots
            .AsNoTracking()
            .Where(rs => activeSnapshotIds.Contains(rs.Id))
            .Include(rs => rs.Sequences)
            .Include(rs => rs.Stations)
            .ToListAsync();

        var snapshotMap = snapshots.ToDictionary(s => s.Id);

        var regions = dbRegions.Select(r =>
        {
            var snap = r.ActiveSnapshotId.HasValue && snapshotMap.TryGetValue(r.ActiveSnapshotId.Value, out var s) ? s : null;
            return new TransitRegion
            {
                Id = r.Id.ToString(),
                RegionName = snap?.Name ?? r.Name,
                RegionColor = snap?.Color ?? r.Color,
                RegionShape = snap?.ShapeType ?? r.ShapeType,
                Points = (snap?.Sequences ?? [])
                    .Select(seq => new RegionPoint
                    {
                        Id = seq.Id.ToString(),
                        Sequence = seq.SequenceNumber,
                        Point = GeoUtils.ToLatLng(seq.Point),
                    })
                    .ToList(),
                Stations = (snap?.Stations ?? [])
                    .Select(st => new TransitStation
                    {
                        Id = st.Id.ToString(),
                        Address = st.Address,
                        AvailableFrom = st.AvailableFrom,
                        AvailableTo = st.AvailableTo,
                        Point = GeoUtils.ToLatLng(st.Point),
                    })
                    .ToList(),
            };
        }).ToList();

        // Active road closures
        var dbClosures = await db.RoadClosures
            .AsNoTracking()
            .Where(c => c.IsPublic && (c.EndDate == null || c.EndDate > DateTime.UtcNow))
            .Include(c => c.Points)
            .ToListAsync();

        var closures = dbClosures.Select(c => new TransitClosure
        {
            Id = c.Id.ToString(),
            ClosureName = c.Name,
            Points = c.Points
                .Select(p => new RegionPoint
                {
                    Id = p.Id.ToString(),
                    Sequence = p.SequenceNumber,
                    Point = GeoUtils.ToLatLng(p.Point),
                })
                .ToList(),
        }).ToList();

        return new TransitData { Routes = routes, Regions = regions, Closures = closures };
    }

    /// <summary>
    /// Build graph nodes from decoded polylines
    /// </summary>
    /// <param name="routes"></param>
    /// <returns></returns>
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
                RouteColor = route.RouteColor,
                Direction = direction,
                PolylineIndex = i,
            };
        }
    }

    /// <summary>
    /// Compute per-route RAW boarding cost (before profile factor)
    /// </summary>
    /// <param name="routes"></param>
    /// <returns></returns>
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

    /// <summary>
    /// Build transit (ride) base edges along polylines
    /// </summary>
    /// <param name="routes"></param>
    /// <param name="nodes"></param>
    /// <returns></returns>
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

        // Initialize empty adjacency lists for nodes with no outgoing edges
        foreach (var nodeId in nodes.Keys)
        {
            adjacency.TryAdd(nodeId, []);
        }

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
    /// Build transfer edges between nearby nodes of different routes
    /// </summary>
    /// <param name="nodes"></param>
    /// <param name="baseEdges"></param>
    private static void BuildBaseTransferEdges(
        Dictionary<string, GraphNode> nodes,
        Dictionary<string, List<BaseEdge>> baseEdges)
    {
        var index = new GridIndex(RoutingConstants.TransferProximityMeters);

        foreach (var (nodeId, node) in nodes)
            index.Insert(nodeId, node.Lat, node.Lng);

        foreach (var (nodeId, node) in nodes)
        {
            var nearby = index.QueryNearby(node.Lat, node.Lng, RoutingConstants.TransferProximityMeters);
            var bestPerRoute = new Dictionary<string, (string OtherId, double Dist)>();

            foreach (var otherId in nearby)
            {
                if (otherId == nodeId) continue;
                var other = nodes[otherId];
                if (node.RouteId == other.RouteId) continue;

                var dist = GeoUtils.HaversineMeters(
                    new LatLng(node.Lat, node.Lng),
                    new LatLng(other.Lat, other.Lng));
                if (dist > RoutingConstants.TransferProximityMeters) continue;

                var dirStr = other.Direction == RouteDirection.GoingTo ? "goingTo" : "goingBack";
                var key = $"{other.RouteId}:{dirStr}";
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

    /// <summary>
    /// Mark closure-affected edges
    /// </summary>
    /// <param name="baseEdges"></param>
    /// <param name="nodes"></param>
    /// <param name="closures"></param>
    private static void MarkClosureEdges(
        Dictionary<string, List<BaseEdge>> baseEdges,
        Dictionary<string, GraphNode> nodes,
        List<TransitClosure> closures)
    {
        if (closures.Count == 0) return;

        var factory = NetTopologySuite.NtsGeometryServices.Instance.CreateGeometryFactory(4326);

        // Build NTS polygons from closure boundary points
        var closurePolygons = closures
            .Where(c => c.Points.Count >= 3)
            .Select(c =>
            {
                var sorted = c.Points.OrderBy(p => p.Sequence).ToList();
                // NTS coordinates: (X=lng, Y=lat)
                var ring = sorted.Select(p => new Coordinate(p.Point.Lng, p.Point.Lat)).ToList();
                ring.Add(ring[0]); // close ring
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

                // Build line segment (NTS coordinate = lng, lat)
                var segment = factory.CreateLineString([
                    new Coordinate(fromNode.Lng, fromNode.Lat),
                    new Coordinate(toNode.Lng, toNode.Lat)
                ]);

                // Check midpoint containment and segment intersection
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

    /// <summary>
    /// Tricycle graph construction — station nodes, ride/walk/hail edges
    /// </summary>
    /// <param name="regions"></param>
    /// <param name="nodes"></param>
    /// <param name="baseEdges"></param>
    /// <param name="start"></param>
    /// <param name="end"></param>
    /// <param name="now"></param>
    private static void BuildTricycleNodesAndEdges(
        List<TransitRegion> regions,
        Dictionary<string, GraphNode> nodes,
        Dictionary<string, List<BaseEdge>> baseEdges,
        LatLng start,
        LatLng end,
        DateTime now)
    {
        var factory = NetTopologySuite.NtsGeometryServices.Instance.CreateGeometryFactory(4326);

        foreach (var region in regions)
        {
            if (region.Points.Count < 3) continue;

            var availableStations = GetAvailableStations(region, now);
            if (availableStations.Count == 0) continue;

            var regionPoly = BuildRegionPolygon(factory, region);
            if (regionPoly == null || !regionPoly.IsValid) continue;

            var startPt = factory.CreatePoint(new Coordinate(start.Lng, start.Lat));
            var endPt = factory.CreatePoint(new Coordinate(end.Lng, end.Lat));
            var startInRegion = regionPoly.Contains(startPt);
            var endInRegion = regionPoly.Contains(endPt);

            // Check if destination is near the region boundary (outside region)
            LatLng? boundaryDropoff = null;
            string? boundaryDropoffId = null;
            if (!endInRegion)
            {
                var nearestBp = NearestBoundaryPoint(factory, end, region);
                var distToBoundary = GeoUtils.HaversineMeters(end, nearestBp);
                if (distToBoundary <= RoutingConstants.MaxRegionBoundaryMeters)
                {
                    boundaryDropoff = nearestBp;
                    boundaryDropoffId = $"tricycle_dropoff:{region.Id}";
                    nodes[boundaryDropoffId] = new GraphNode
                    {
                        Id = boundaryDropoffId,
                        Lat = nearestBp.Lat,
                        Lng = nearestBp.Lng,
                        RouteId = $"__tricycle_region__:{region.Id}",
                        RouteName = region.RegionName,
                        RouteColor = region.RegionColor,
                        Direction = RouteDirection.GoingTo,
                        PolylineIndex = -1,
                    };
                    baseEdges[boundaryDropoffId] = [];
                }
            }

            // Collect jeepney nodes inside the region polygon (for hail edges)
            var jeepneyNodesInRegion = new HashSet<string>();
            foreach (var (nodeId, node) in nodes)
            {
                if (node.RouteId == "__virtual__") continue;
                if (node.RouteId.StartsWith("__tricycle_region__:")) continue;
                var pt = factory.CreatePoint(new Coordinate(node.Lng, node.Lat));
                if (regionPoly.Contains(pt))
                    jeepneyNodesInRegion.Add(nodeId);
            }

            // Track boundary exit nodes for this region (dedup within 100 m)
            var boundaryExitNodes = new Dictionary<string, LatLng>();

            // --- Create station nodes & edges ---
            foreach (var station in availableStations)
            {
                var stationNodeId = $"tricycle:{station.Id}";
                nodes[stationNodeId] = new GraphNode
                {
                    Id = stationNodeId,
                    Lat = station.Point.Lat,
                    Lng = station.Point.Lng,
                    RouteId = $"__tricycle_region__:{region.Id}",
                    RouteName = station.Address,
                    RouteColor = region.RegionColor,
                    Direction = RouteDirection.GoingTo,
                    PolylineIndex = -1,
                };

                var stationEdges = new List<BaseEdge>();

                // Find jeepney nodes near THIS station
                var nearbyJeepNodes = new List<string>();
                foreach (var (nodeId, node) in nodes)
                {
                    if (node.RouteId == "__virtual__") continue;
                    if (node.RouteId.StartsWith("__tricycle_region__:")) continue;
                    var dist = GeoUtils.HaversineMeters(station.Point, new LatLng(node.Lat, node.Lng));
                    if (dist <= RoutingConstants.MaxTricycleStationWalkMeters)
                    {
                        nearbyJeepNodes.Add(nodeId);
                        jeepneyNodesInRegion.Add(nodeId);
                    }
                }

                // --- Station → nearby jeepney nodes ---
                var addedStationToExit = new HashSet<string>();

                foreach (var jeepNodeId in nearbyJeepNodes)
                {
                    var jeepNode = nodes[jeepNodeId];
                    var jeepPoint = new LatLng(jeepNode.Lat, jeepNode.Lng);
                    var jeepPt = factory.CreatePoint(new Coordinate(jeepNode.Lng, jeepNode.Lat));
                    var jeepInsideRegion = regionPoly.Contains(jeepPt);

                    if (jeepInsideRegion)
                    {
                        // Rare: jeepney node inside region — direct tricycle OK
                        var straightDist = GeoUtils.HaversineMeters(station.Point, jeepPoint);
                        if (straightDist > RoutingConstants.MaxTricycleRideToTransitMeters) continue;
                        stationEdges.Add(new BaseEdge
                        {
                            From = stationNodeId,
                            To = jeepNodeId,
                            Distance = straightDist * RoutingConstants.TricycleDetourFactor,
                            Type = EdgeType.Tricycle,
                            StationId = station.Id,
                            StationName = station.Address,
                            RegionId = region.Id,
                            IsHail = false,
                            RouteId = jeepNode.RouteId,
                            RouteName = jeepNode.RouteName,
                        });
                        continue;
                    }

                    // Jeepney outside region — route through boundary exit node
                    var exitPt = NearestBoundaryPoint(factory, jeepPoint, region);
                    var exitToJeep = GeoUtils.HaversineMeters(exitPt, jeepPoint);
                    if (exitToJeep > RoutingConstants.MaxBoundaryExitWalkMeters) continue;

                    // Dedup: reuse an existing boundary exit within 100 m
                    string? exitId = null;
                    foreach (var (id, pt) in boundaryExitNodes)
                    {
                        if (GeoUtils.HaversineMeters(pt, exitPt) < 100) { exitId = id; break; }
                    }

                    if (exitId == null)
                    {
                        exitId = $"boundary_exit:{region.Id}:{boundaryExitNodes.Count}";
                        boundaryExitNodes[exitId] = exitPt;
                        nodes[exitId] = new GraphNode
                        {
                            Id = exitId,
                            Lat = exitPt.Lat,
                            Lng = exitPt.Lng,
                            RouteId = $"__tricycle_region__:{region.Id}",
                            RouteName = region.RegionName,
                            RouteColor = region.RegionColor,
                            Direction = RouteDirection.GoingTo,
                            PolylineIndex = -1,
                        };
                        baseEdges[exitId] = [];
                    }

                    // Station → boundary exit (tricycle, inside region)
                    if (addedStationToExit.Add(exitId))
                    {
                        var actualExit = boundaryExitNodes[exitId];
                        var stToExit = GeoUtils.HaversineMeters(station.Point, actualExit) * RoutingConstants.TricycleDetourFactor;
                        stationEdges.Add(new BaseEdge
                        {
                            From = stationNodeId,
                            To = exitId,
                            Distance = stToExit,
                            Type = EdgeType.Tricycle,
                            StationId = station.Id,
                            StationName = station.Address,
                            RegionId = region.Id,
                            IsHail = false,
                        });
                    }

                    // Boundary exit → jeepney (walk)
                    var exitEdges = baseEdges[exitId];
                    if (exitEdges.All(e => e.To != jeepNodeId))
                    {
                        exitEdges.Add(new BaseEdge
                        {
                            From = exitId,
                            To = jeepNodeId,
                            Distance = exitToJeep * RoutingConstants.WalkDetourFactor,
                            Type = EdgeType.Walk,
                        });
                    }
                }

                // --- Station → VIRTUAL_END (ride, if destination inside region) ---
                if (endInRegion)
                {
                    var rideDist = GeoUtils.HaversineMeters(station.Point, end) * RoutingConstants.TricycleDetourFactor;
                    stationEdges.Add(new BaseEdge
                    {
                        From = stationNodeId,
                        To = RoutingConstants.VirtualEndId,
                        Distance = rideDist,
                        Type = EdgeType.Tricycle,
                        StationId = station.Id,
                        StationName = station.Address,
                        RegionId = region.Id,
                        IsHail = false,
                    });
                }

                // --- Station → boundary drop-off (ride, if near boundary) ---
                if (boundaryDropoff.HasValue && boundaryDropoffId != null)
                {
                    var rideDist = GeoUtils.HaversineMeters(station.Point, boundaryDropoff.Value) * RoutingConstants.TricycleDetourFactor;
                    stationEdges.Add(new BaseEdge
                    {
                        From = stationNodeId,
                        To = boundaryDropoffId,
                        Distance = rideDist,
                        Type = EdgeType.Tricycle,
                        StationId = station.Id,
                        StationName = station.Address,
                        RegionId = region.Id,
                        IsHail = false,
                    });
                }

                baseEdges[stationNodeId] = stationEdges;

                // --- Nearby jeepney → station (walk to station for boarding) ---
                foreach (var jeepNodeId in nearbyJeepNodes)
                {
                    var jeepNode = nodes[jeepNodeId];
                    var walkDist = GeoUtils.HaversineMeters(
                        new LatLng(jeepNode.Lat, jeepNode.Lng), station.Point) * RoutingConstants.WalkDetourFactor;

                    // Backtracking penalty
                    var distFromNodeToEnd = GeoUtils.HaversineMeters(new LatLng(jeepNode.Lat, jeepNode.Lng), end);
                    var distFromStationToEnd = GeoUtils.HaversineMeters(station.Point, end);
                    var detourRatio = distFromNodeToEnd > 0 ? distFromStationToEnd / distFromNodeToEnd : 1.0;

                    if (!baseEdges.TryGetValue(jeepNodeId, out var jeepEdges))
                    {
                        jeepEdges = [];
                        baseEdges[jeepNodeId] = jeepEdges;
                    }

                    // Walk edge to station
                    jeepEdges.Add(new BaseEdge
                    {
                        From = jeepNodeId,
                        To = stationNodeId,
                        Distance = walkDist,
                        Type = EdgeType.Walk,
                        StationId = station.Id,
                        StationName = station.Address,
                        RegionId = region.Id,
                        DetourRatio = detourRatio > 1 ? detourRatio : null,
                    });
                }

                // --- Hail edges: nearby jeepney node → station (mid-route tricycle transfer) ---
                // Only for nodes where the walk to the station is within the hail cap.
                // Also store the walk distance so the costing model accounts for the
                // WALK leg the leg assembler will emit from the alight point to the station.
                foreach (var jeepNodeId in nearbyJeepNodes)
                {
                    var jeepNode = nodes[jeepNodeId];
                    var walkToStation = GeoUtils.HaversineMeters(
                        new LatLng(jeepNode.Lat, jeepNode.Lng), station.Point);

                    // Skip if walk to station is too far — same cap as direct hail edges
                    if (walkToStation > RoutingConstants.MaxDirectWalkInsteadOfHailMeters) continue;

                    var hailRideDist = walkToStation * RoutingConstants.TricycleDetourFactor;

                    if (!baseEdges.TryGetValue(jeepNodeId, out var jeepEdges))
                    {
                        jeepEdges = [];
                        baseEdges[jeepNodeId] = jeepEdges;
                    }

                    jeepEdges.Add(new BaseEdge
                    {
                        From = jeepNodeId,
                        To = stationNodeId,
                        Distance = hailRideDist,
                        Type = EdgeType.Tricycle,
                        StationId = station.Id,
                        StationName = station.Address,
                        StationPoint = station.Point,
                        RegionId = region.Id,
                        IsHail = true,
                        // The leg assembler emits a WALK from the alight point to the station.
                        // Include this cost so A* does not underestimate the true path cost.
                        WalkToStationDist = walkToStation * RoutingConstants.WalkDetourFactor,
                    });
                }

                // --- VIRTUAL_START → station (walk + hail, if start inside region) ---
                if (startInRegion)
                {
                    var walkDist = GeoUtils.HaversineMeters(start, station.Point);
                    if (!(walkDist <= RoutingConstants.MaxTricycleStationWalkMeters)) continue;
                    if (!baseEdges.TryGetValue(RoutingConstants.VirtualStartId, out var startEdges))
                    {
                        startEdges = [];
                        baseEdges[RoutingConstants.VirtualStartId] = startEdges;
                    }

                    // Walk to station
                    startEdges.Add(new BaseEdge
                    {
                        From = RoutingConstants.VirtualStartId,
                        To = stationNodeId,
                        Distance = walkDist,
                        Type = EdgeType.Walk,
                        StationId = station.Id,
                        StationName = station.Address,
                        RegionId = region.Id,
                    });

                    // Hail from start
                    var hailDist = walkDist * RoutingConstants.TricycleDetourFactor;
                    startEdges.Add(new BaseEdge
                    {
                        From = RoutingConstants.VirtualStartId,
                        To = stationNodeId,
                        Distance = hailDist,
                        Type = EdgeType.Tricycle,
                        StationId = station.Id,
                        StationName = station.Address,
                        StationPoint = station.Point,
                        RegionId = region.Id,
                        IsHail = true,
                    });
                }
            }

            // --- Direct hail edges: jeepney → VIRTUAL_END (if end in region) ---
            if (endInRegion)
            {
                foreach (var jeepNodeId in jeepneyNodesInRegion)
                {
                    var jeepNode = nodes[jeepNodeId];
                    var jeepPoint = new LatLng(jeepNode.Lat, jeepNode.Lng);

                    var directToEnd = GeoUtils.HaversineMeters(jeepPoint, end);
                    if (directToEnd < RoutingConstants.MaxDirectWalkInsteadOfHailMeters) continue;

                    // Pick nearest station to jeepney node
                    TransitStation? nearestStation = null;
                    var nearestDist = double.MaxValue;
                    foreach (var s in availableStations)
                    {
                        var d = GeoUtils.HaversineMeters(jeepPoint, s.Point);
                        if (d < nearestDist) { nearestStation = s; nearestDist = d; }
                    }
                    if (nearestStation == null) continue;

                    var walkToStation = nearestDist;
                    if (walkToStation > directToEnd) continue;

                    var tricycleFromStation = GeoUtils.HaversineMeters(nearestStation.Point, end) * RoutingConstants.TricycleDetourFactor;

                    if (!baseEdges.TryGetValue(jeepNodeId, out var jeepEdges))
                    {
                        jeepEdges = [];
                        baseEdges[jeepNodeId] = jeepEdges;
                    }

                    jeepEdges.Add(new BaseEdge
                    {
                        From = jeepNodeId,
                        To = RoutingConstants.VirtualEndId,
                        Distance = tricycleFromStation,
                        Type = EdgeType.Tricycle,
                        StationId = nearestStation.Id,
                        StationName = nearestStation.Address,
                        StationPoint = nearestStation.Point,
                        RegionId = region.Id,
                        IsHail = true,
                        WalkToStationDist = walkToStation,
                    });
                }
            }

            // --- Boundary drop-off → VIRTUAL_END (walk from boundary to destination) ---
            if (boundaryDropoff.HasValue && boundaryDropoffId != null)
            {
                var walkDist = GeoUtils.HaversineMeters(boundaryDropoff.Value, end) * RoutingConstants.WalkDetourFactor;
                if (!baseEdges.TryGetValue(boundaryDropoffId, out var dropoffEdges))
                {
                    dropoffEdges = [];
                    baseEdges[boundaryDropoffId] = dropoffEdges;
                }
                dropoffEdges.Add(new BaseEdge
                {
                    From = boundaryDropoffId,
                    To = RoutingConstants.VirtualEndId,
                    Distance = walkDist,
                    Type = EdgeType.Walk,
                });
            }

            // --- Intra-region: START hail → VIRTUAL_END ---
            if (startInRegion && endInRegion)
            {
                TransitStation? nearestStation = null;
                var nearestDist = double.MaxValue;
                foreach (var s in availableStations)
                {
                    var d = GeoUtils.HaversineMeters(start, s.Point);
                    if (d < nearestDist) { nearestStation = s; nearestDist = d; }
                }

                if (nearestStation != null)
                {
                    if (!baseEdges.TryGetValue(RoutingConstants.VirtualStartId, out var startEdges))
                    {
                        startEdges = [];
                        baseEdges[RoutingConstants.VirtualStartId] = startEdges;
                    }

                    var rideDist = GeoUtils.HaversineMeters(start, end) * RoutingConstants.TricycleDetourFactor;
                    startEdges.Add(new BaseEdge
                    {
                        From = RoutingConstants.VirtualStartId,
                        To = RoutingConstants.VirtualEndId,
                        Distance = rideDist,
                        Type = EdgeType.Tricycle,
                        StationId = nearestStation.Id,
                        StationName = nearestStation.Address,
                        StationPoint = nearestStation.Point,
                        RegionId = region.Id,
                        IsHail = true,
                    });
                }
            }
        }
    }

    /// <summary>
    /// Query raw walk distances for virtual start/end nodes (GraphHopper I/O)
    /// </summary>
    /// <param name="start"></param>
    /// <param name="end"></param>
    /// <param name="routes"></param>
    /// <param name="nodes"></param>
    /// <returns></returns>
    private async Task<(Dictionary<string, double> Access, Dictionary<string, double> Egress)>
        QueryUserNodeDistancesAsync(
            LatLng start,
            LatLng end,
            List<TransitRoute> routes,
            Dictionary<string, GraphNode> nodes)
    {
        // Ensure virtual nodes exist
        nodes[RoutingConstants.VirtualStartId] = new GraphNode
        {
            Id = RoutingConstants.VirtualStartId,
            Lat = start.Lat,
            Lng = start.Lng,
            RouteId = "__virtual__",
            RouteName = "",
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
            RouteColor = "",
            Direction = RouteDirection.GoingTo,
            PolylineIndex = -1,
        };

        var abLat = end.Lat - start.Lat;
        var abLng = end.Lng - start.Lng;

        // --- ACCESS candidates ---
        var accessDegThreshold = RoutingConstants.MaxTransitProximityMeters / 111_320.0;
        var candidatesByGroup = new Dictionary<string, List<(string NodeId, double GeoDist)>>();

        foreach (var (nodeId, node) in nodes)
        {
            if (node.RouteId == "__virtual__") continue;
            if (Math.Abs(node.Lat - start.Lat) > accessDegThreshold) continue;
            if (Math.Abs(node.Lng - start.Lng) > accessDegThreshold * 1.5) continue;

            var dist = GeoUtils.HaversineMeters(new LatLng(node.Lat, node.Lng), start);
            if (dist > RoutingConstants.MaxTransitProximityMeters) continue;

            var route = routes.Find(r => r.Id == node.RouteId);
            if (route == null) continue;

            var coords = node.Direction == RouteDirection.GoingTo ? route.DecodedGoingTo : route.DecodedGoingBack;
            if (coords.Count < 2) continue;

            var routeDir = GeoUtils.GetRouteDirection(coords, node.PolylineIndex);
            var dotProduct = routeDir.dLat * abLat + routeDir.dLng * abLng;
            if (dotProduct <= 0) continue;

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
            accessCandidates.AddRange(group.Take(RoutingConstants.AccessCandidatesPerDirection));
        }
        accessCandidates.Sort((a, b) => a.GeoDist.CompareTo(b.GeoDist));
        var cappedAccess = accessCandidates.Take(RoutingConstants.MaxAccessQueries).ToList();

        // Query GraphHopper in parallel
        var accessTasks = cappedAccess.Select(async c =>
        {
            var node = nodes[c.NodeId];
            var d = await graphHopper.GetWalkDistanceAsync(start, new LatLng(node.Lat, node.Lng));
            return (c.NodeId, Dist: double.IsPositiveInfinity(d) ? c.GeoDist * 1.4 : d);
        });

        var accessResults = await Task.WhenAll(accessTasks);
        var accessDistances = new Dictionary<string, double>();
        foreach (var (nodeId, dist) in accessResults)
        {
            if (double.IsFinite(dist))
                accessDistances[nodeId] = dist;
        }

        // --- EGRESS candidates ---
        var egressDegThreshold = RoutingConstants.MaxTransitProximityMeters / 111_320.0;
        var egressByGroup = new Dictionary<string, List<(string NodeId, double GeoDist)>>();

        foreach (var (nodeId, node) in nodes)
        {
            if (node.RouteId == "__virtual__") continue;
            if (Math.Abs(node.Lat - end.Lat) > egressDegThreshold) continue;
            if (Math.Abs(node.Lng - end.Lng) > egressDegThreshold * 1.5) continue;

            var dist = GeoUtils.HaversineMeters(new LatLng(node.Lat, node.Lng), end);
            if (dist > RoutingConstants.MaxTransitProximityMeters) continue;

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
            egressCandidates.AddRange(group.Take(RoutingConstants.EgressCandidatesPerDirection));
        }
        egressCandidates.Sort((a, b) => a.GeoDist.CompareTo(b.GeoDist));
        var cappedEgress = egressCandidates.Take(RoutingConstants.MaxEgressQueries).ToList();

        var egressTasks = cappedEgress.Select(async c =>
        {
            var node = nodes[c.NodeId];
            var d = await graphHopper.GetWalkDistanceAsync(new LatLng(node.Lat, node.Lng), end);
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

    /// <summary>
    /// Build costed adjacency from base graph and weight profile
    /// </summary>
    /// <param name="baseEdges"></param>
    /// <param name="rawBoardingCosts"></param>
    /// <param name="accessDistances"></param>
    /// <param name="egressDistances"></param>
    /// <param name="nodes"></param>
    /// <param name="profile"></param>
    /// <returns></returns>
    public static Dictionary<string, List<GraphEdge>> BuildCostedAdjacency(
        Dictionary<string, List<BaseEdge>> baseEdges,
        Dictionary<string, double> rawBoardingCosts,
        Dictionary<string, double> accessDistances,
        Dictionary<string, double> egressDistances,
        Dictionary<string, GraphNode> nodes,
        WeightProfile profile)
    {
        var adjacency = new Dictionary<string, List<GraphEdge>>();

        // Apply costs to all base edges
        foreach (var (nodeId, edges) in baseEdges)
        {
            var costed = new List<GraphEdge>(edges.Count);

            foreach (var baseEdge in edges)
            {
                double cost;

                switch (baseEdge.Type)
                {
                    case EdgeType.Transit:
                        cost = baseEdge.Distance * profile.TransitCostFactor;
                        if (profile.PenalizedRouteIds?.Contains(baseEdge.RouteId!) == true)
                            cost *= profile.DiversityPenalty ?? 1;
                        if (baseEdge.ClosureAffected)
                            cost *= profile.ClosurePenaltyMultiplier;
                        break;

                    case EdgeType.Transfer:
                    {
                        var walkCost = (baseEdge.TransferWalkDist ?? baseEdge.Distance) * profile.WalkPenaltyMultiplier;
                        rawBoardingCosts.TryGetValue(baseEdge.RouteId ?? "", out var rawBc);
                        var boardingCost = rawBc * profile.BoardingCostFactor;
                        cost = walkCost + profile.TransferPenaltyMeters + boardingCost;
                        break;
                    }

                    case EdgeType.Tricycle:
                    {
                        var waitPenalty = baseEdge.IsHail
                            ? RoutingConstants.HailingWaitPenaltyMeters
                            : RoutingConstants.StationWaitPenaltyMeters;
                        cost = baseEdge.Distance * RoutingConstants.TricycleRideCostFactor + waitPenalty;

                        if (baseEdge.WalkToStationDist.HasValue)
                            cost += GeoUtils.ProfileWalkCost(baseEdge.WalkToStationDist.Value, profile);

                        if (baseEdge is { RouteId: not null, IsHail: false })
                        {
                            rawBoardingCosts.TryGetValue(baseEdge.RouteId, out var bc);
                            cost += bc * profile.BoardingCostFactor;
                        }
                        break;
                    }

                    default: // Walk
                    {
                        var effectiveDist = baseEdge.Distance;
                        if (baseEdge.DetourRatio is > 1)
                            effectiveDist *= Math.Min(baseEdge.DetourRatio.Value, RoutingConstants.BacktrackPenaltyMultiplier);
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
                    StationId = baseEdge.StationId,
                    StationName = baseEdge.StationName,
                    StationPoint = baseEdge.StationPoint,
                });
            }

            adjacency[nodeId] = costed;
        }

        // Add access edges (VIRTUAL_START → transit nodes)
        if (!adjacency.TryGetValue(RoutingConstants.VirtualStartId, out var existingStartEdges))
        {
            existingStartEdges = [];
            adjacency[RoutingConstants.VirtualStartId] = existingStartEdges;
        }

        foreach (var (nodeId, rawDist) in accessDistances)
        {
            if (!nodes.TryGetValue(nodeId, out var node)) continue;
            var walkCost = GeoUtils.ProfileWalkCost(rawDist, profile);
            rawBoardingCosts.TryGetValue(node.RouteId, out var bc);
            var boardingCost = bc * profile.BoardingCostFactor;
            existingStartEdges.Add(new GraphEdge
            {
                From = RoutingConstants.VirtualStartId,
                To = nodeId,
                Distance = rawDist,
                Cost = walkCost + boardingCost,
                Type = EdgeType.Walk,
                RouteId = node.RouteId,
                RouteName = node.RouteName,
            });
        }

        // Add egress edges (transit nodes → VIRTUAL_END)
        foreach (var (nodeId, rawDist) in egressDistances)
        {
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

        // Ensure VIRTUAL_END has an entry
        adjacency.TryAdd(RoutingConstants.VirtualEndId, []);

        return adjacency;
    }

    // =====================================================================
    // 8. Full base-graph builder (single entry point for orchestrator)
    // =====================================================================

    /// <summary>
    /// Build the static portion of the graph from DB (or Redis cache).
    /// This is everything that doesn't depend on start/end coordinates:
    /// transit data, nodes, transit edges, transfer edges, closure marks,
    /// and raw boarding costs.
    /// </summary>
    private async Task<CachedStaticGraph?> GetStaticGraphAsync()
    {
        return await transitCache.GetOrBuildAsync(async () =>
        {
            var transitData = await LoadTransitDataAsync();
            if (transitData.Routes.Count == 0) return null;

            var nodes = BuildGraphNodes(transitData.Routes);
            var baseEdges = BuildBaseTransitEdges(transitData.Routes, nodes);
            BuildBaseTransferEdges(nodes, baseEdges);
            MarkClosureEdges(baseEdges, nodes, transitData.Closures);

            var rawBoardingCosts = ComputeRawBoardingCosts(transitData.Routes);

            return new CachedStaticGraph
            {
                TransitData = transitData,
                Nodes = nodes,
                BaseEdges = baseEdges,
                RawBoardingCosts = rawBoardingCosts,
            };
        });
    }

    public async Task<(BaseGraph Graph, TransitData Data)?> BuildBaseGraphAsync(
        LatLng start, LatLng end, DateTime? now = null)
    {
        var staticGraph = await GetStaticGraphAsync();
        if (staticGraph == null) return null;

        // Deep-clone the mutable portions so per-request tricycle edges
        // and virtual nodes don't pollute the cached copy
        var nodes = new Dictionary<string, GraphNode>(staticGraph.Nodes);
        var baseEdges = staticGraph.BaseEdges
            .ToDictionary(kv => kv.Key, kv => new List<BaseEdge>(kv.Value));

        // Tricycle station nodes & edges (time-window filtered, depends on start/end)
        BuildTricycleNodesAndEdges(
            staticGraph.TransitData.Regions, nodes, baseEdges, start, end, now ?? DateTime.UtcNow);

        // Query GraphHopper for real walk distances (expensive I/O — done once)
        var (accessDistances, egressDistances) = await QueryUserNodeDistancesAsync(
            start, end, staticGraph.TransitData.Routes, nodes);

        var baseGraph = new BaseGraph
        {
            Nodes = nodes,
            BaseEdges = baseEdges,
            RawBoardingCosts = staticGraph.RawBoardingCosts,
            AccessWalkDistances = accessDistances,
            EgressWalkDistances = egressDistances,
            HasAccessEdges = accessDistances.Count > 0,
            HasEgressEdges = egressDistances.Count > 0,
        };

        return (baseGraph, staticGraph.TransitData);
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    private static bool IsStationAvailable(TransitStation station, DateTime now)
    {
        var currentMinutes = now.Hour * 60 + now.Minute;
        var fromParts = station.AvailableFrom.Split(':');
        var toParts = station.AvailableTo.Split(':');
        var fromMin = int.Parse(fromParts[0]) * 60 + int.Parse(fromParts[1]);
        var toMin = int.Parse(toParts[0]) * 60 + int.Parse(toParts[1]);

        if (fromMin <= toMin)
            return currentMinutes >= fromMin && currentMinutes <= toMin;
        // Crosses midnight
        return currentMinutes >= fromMin || currentMinutes <= toMin;
    }

    private static List<TransitStation> GetAvailableStations(TransitRegion region, DateTime now)
    {
        if (region.Stations.Count == 0) return [];
        var available = region.Stations.Where(s => IsStationAvailable(s, now)).ToList();
        var unavailableRatio = 1.0 - (double)available.Count / region.Stations.Count;
        if (unavailableRatio >= RoutingConstants.StationUnavailabilityThreshold) return [];
        return available;
    }

    private static Polygon? BuildRegionPolygon(GeometryFactory factory, TransitRegion region)
    {
        var sorted = region.Points.OrderBy(p => p.Sequence).ToList();
        if (sorted.Count < 3) return null;
        var ring = sorted.Select(p => new Coordinate(p.Point.Lng, p.Point.Lat)).ToList();
        ring.Add(ring[0]); // close ring
        return factory.CreatePolygon(ring.ToArray());
    }

    private static LatLng NearestBoundaryPoint(GeometryFactory factory, LatLng target, TransitRegion region)
    {
        var sorted = region.Points.OrderBy(p => p.Sequence).ToList();
        var ring = sorted.Select(p => new Coordinate(p.Point.Lng, p.Point.Lat)).ToList();
        ring.Add(ring[0]);
        var boundaryLine = factory.CreateLineString(ring.ToArray());
        var pt = factory.CreatePoint(new Coordinate(target.Lng, target.Lat));
        var nearest = NetTopologySuite.Operation.Distance.DistanceOp.NearestPoints(boundaryLine, pt);
        // nearest[0] is on the line, nearest[1] is the query point
        return new LatLng(nearest[0].Y, nearest[0].X);
    }
}
