using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Data;
using JippyServices.Algorithm.Navigator.Cache;
using JippyServices.Algorithm.Navigator.Common;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Polyline;
using JippyServices.Algorithm.Utilities;
using JippyServices.Algorithm.Weights;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using RouteDirection = JippyServices.Algorithm.Navigator.Common.Types.RouteDirection;

namespace JippyServices.Algorithm.Navigator.V2;

/// <summary>
/// Dynamic graph construction from transit data.
/// </summary>
internal sealed class GraphBuilder
{
    private readonly DataContext _db;
    private readonly IOSRMClient _walk;
    private readonly ITransitDataCache _cache;
    private readonly IWeightsManager _weights;

    public GraphBuilder(DataContext db, IOSRMClient walk, ITransitDataCache cache, IWeightsManager weights) 
    {
        _db = db;
        _walk = walk;
        _cache = cache;
        _weights = weights;
    }
    
    /// <summary>
    /// Query the database for all active public transit data: routes, tricycle regions
    /// (with their stations), road closures, and boarding restriction zones.
    /// All queries use <c>AsNoTracking</c> for read-only performance.
    /// </summary>
    /// <returns>
    /// A <see cref="TransitData"/> snapshot containing routes, regions, closures, and stops.
    /// </returns>
    private async Task<TransitData> LoadTransitDataAsync()
    {
        // Public-viewable routes with an active snapshot
        var dbRoutes = await _db.Routes
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
        var dbRegions = await _db.RegionMarkers
            .AsNoTracking()
            .Where(r => r.IsPublic && r.ActiveSnapshotId != null)
            .ToListAsync();

        var activeSnapshotIds = dbRegions
            .Where(r => r.ActiveSnapshotId.HasValue)
            .Select(r => r.ActiveSnapshotId!.Value)
            .ToList();

        var snapshots = await _db.RegionSnapshots
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
        var dbClosures = await _db.RoadClosures
            .AsNoTracking()
            .Where(c => c.IsPublic && (c.EndDate == null || c.EndDate > DateTime.UtcNow))
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

        // Public stops with their associated route restrictions
        var dbStops = await _db.RestrictedBordingZones
            .AsNoTracking()
            .Where(s => s.IsPublic && s.Polyline != string.Empty)
            .Include(s => s.Routes)
            .ToListAsync();

        var stops = dbStops
            .Select(s =>
            {
                var decoded = string.IsNullOrEmpty(s.Polyline) ? [] : PolylineCodec.Decode(s.Polyline);
                if (decoded.Count < 2) return null;

                var restrictionType = s.RestrictionType == "specific"
                    ? RestrictionType.Specific
                    : RestrictionType.Universal;

                var disallowedDirection = s.DisallowedDirection switch
                {
                    "direction_to" => DisallowedDirection.DirectionTo,
                    "direction_back" => DisallowedDirection.DirectionBack,
                    _ => DisallowedDirection.Both,
                };

                return new TransitStop
                {
                    Id = s.Id.ToString(),
                    RestrictionType = restrictionType,
                    DisallowedDirection = disallowedDirection,
                    DecodedPolyline = decoded,
                    RouteIds = s.Routes.Select(r => r.RouteId.ToString()).ToList(),
                };
            })
            .Where(s => s != null)
            .Cast<TransitStop>()
            .ToList();

        return new TransitData { Routes = routes, Regions = regions, Closures = closures, Stops = stops };
    }

    /// <summary>
    /// Create one <see cref="GraphNode"/> per polyline vertex for each route and direction.
    /// Node IDs are formatted as <c>"{routeId}:{goingTo|goingBack}:{index}"</c>.
    /// Routes with fewer than two vertices in a direction are skipped.
    /// </summary>
    /// <param name="routes">All active transit routes with pre-decoded polylines.</param>
    /// <returns>Dictionary of all graph nodes keyed by node ID.</returns>
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

    /// <summary>
    /// Add nodes for all vertices of a single route direction to the shared node dictionary.
    /// </summary>
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
    /// Estimate the average boarding wait cost for each route in metres, before the
    /// <see cref="WeightProfile.BoardingCostFactor"/> multiplier is applied.
    /// The formula models headway as: <c>round-trip distance / fleet count / 2</c>,
    /// which approximates the average gap between successive vehicles.
    /// A single cost per route is stored — all nodes on that route share the same boarding cost.
    /// </summary>
    /// <param name="routes">All active transit routes.</param>
    /// <returns>Dictionary mapping route ID to raw boarding cost in metres.</returns>
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
    /// Build uncosted <see cref="EdgeType.Transit"/> edges connecting consecutive polyline vertices
    /// within each route and direction. Distance is the haversine between adjacent nodes.
    /// Also initialises empty adjacency lists for nodes that have no outgoing edges.
    /// </summary>
    /// <param name="routes">All active transit routes.</param>
    /// <param name="nodes">Node dictionary used to initialise empty adjacency lists.</param>
    /// <returns>Base adjacency list keyed by source node ID.</returns>
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

    /// <summary>
    /// Add transit edges for all consecutive vertex pairs of a single route direction.
    /// </summary>
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
    /// Add bidirectional <see cref="EdgeType.Transfer"/> edges between nodes of different routes
    /// that are within <see cref="RoutingConfig.TransferProximityMeters"/> of each other.
    /// Uses a <see cref="GridIndex"/> for O(1) spatial lookups rather than O(n²) brute force.
    /// A shared buffer list is reused across queries to reduce GC pressure.
    /// </summary>
    /// <param name="nodes">All graph nodes.</param>
    /// <param name="baseEdges">The adjacency list to append transfer edges to (mutated in place).</param>
    /// <param name="config">Routing config supplying the transfer proximity threshold.</param>
    private static void BuildBaseTransferEdges(
        Dictionary<string, GraphNode> nodes,
        Dictionary<string, List<BaseEdge>> baseEdges,
        RoutingConfig config)
    {
        var index = new GridIndex(config.TransferProximityMeters);

        foreach (var (nodeId, node) in nodes)
            index.Insert(nodeId, node.Lat, node.Lng);

        // Reuse a single buffer list across all QueryNearby calls to avoid
        // allocating a new List<string> per node (significant GC pressure).
        var nearbyBuffer = new List<string>(64);

        foreach (var (nodeId, node) in nodes)
        {
            nearbyBuffer.Clear();
            index.QueryNearby(node.Lat, node.Lng, config.TransferProximityMeters, nearbyBuffer);

            // Use a (RouteId, Direction) value-tuple key to avoid string
            // interpolation allocations inside the hot inner loop.
            var bestPerRoute = new Dictionary<(string, RouteDirection), (string OtherId, double Dist)>();

            foreach (var otherId in nearbyBuffer)
            {
                if (otherId == nodeId) continue;
                var other = nodes[otherId];
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

    /// <summary>
    /// Add <paramref name="edge"/> to the adjacency list only when no existing edge already
    /// connects the same <c>From</c> → <c>To</c> pair. Prevents duplicate transfer edges
    /// when multiple nearby nodes share the same route.
    /// </summary>
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
    /// Set <see cref="BaseEdge.ClosureAffected"/> on any transit edge whose midpoint
    /// falls inside an active road closure polygon. During cost computation these edges
    /// receive a <see cref="RoutingConfig.ClosurePenaltyMultiplier"/> penalty.
    /// Closures are represented as NTS <see cref="Polygon"/> objects; intersection is tested
    /// using NTS <c>Contains</c>. Mutates <paramref name="baseEdges"/> in place.
    /// </summary>
    /// <param name="baseEdges">The adjacency list whose transit edges will be flagged.</param>
    /// <param name="nodes">Node dictionary used to resolve midpoint coordinates.</param>
    /// <param name="closures">Active road closure definitions.</param>
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
    /// Inject tricycle station nodes and their associated ride, walk, and hail edges into
    /// the per-request graph. Only regions with at least one available station (time-window
    /// check) are processed. Generates:
    /// <list type="bullet">
    ///   <item><description><see cref="EdgeType.Tricycle"/> ride edges from stations to region boundary exits.</description></item>
    ///   <item><description>Walk edges from nearby jeepney nodes to stations (access).</description></item>
    ///   <item><description>Hail edges allowing on-road tricycle boarding without a fixed station.</description></item>
    ///   <item><description>Last-mile egress edges from station/hail points toward the destination.</description></item>
    /// </list>
    /// Mutates <paramref name="nodes"/> and <paramref name="baseEdges"/> in place.
    /// </summary>
    /// <param name="regions">All active tricycle regions with their stations.</param>
    /// <param name="nodes">Graph node dictionary (mutated to add station nodes).</param>
    /// <param name="baseEdges">Adjacency list (mutated to add tricycle edges).</param>
    /// <param name="start">Trip origin, used to determine proximity to tricycle regions.</param>
    /// <param name="end">Trip destination, used for last-mile edge construction.</param>
    /// <param name="now">Current UTC time, used to filter stations by operating hours.</param>
    /// <param name="config">Routing config supplying tricycle-specific thresholds.</param>
    private static void BuildTricycleNodesAndEdges(
        List<TransitRegion> regions,
        Dictionary<string, GraphNode> nodes,
        Dictionary<string, List<BaseEdge>> baseEdges,
        LatLng start,
        LatLng end,
        DateTime now,
        RoutingConfig config)
    {
        var factory = NetTopologySuite.NtsGeometryServices.Instance.CreateGeometryFactory(4326);

        foreach (var region in regions)
        {
            if (region.Points.Count < 3) continue;

            var availableStations = GetAvailableStations(region, now, config);
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
                if (distToBoundary <= config.MaxRegionBoundaryMeters)
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
                        RouteNumber = "",
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
                    RouteNumber = "",
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
                    if (dist <= config.MaxTricycleStationWalkMeters)
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
                        if (straightDist > config.MaxTricycleRideToTransitMeters) continue;
                        stationEdges.Add(new BaseEdge
                        {
                            From = stationNodeId,
                            To = jeepNodeId,
                            Distance = straightDist * config.TricycleDetourFactor,
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
                    if (exitToJeep > config.MaxBoundaryExitWalkMeters) continue;

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
                            RouteNumber = "",
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
                        var stToExit = GeoUtils.HaversineMeters(station.Point, actualExit) * config.TricycleDetourFactor;
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
                            Distance = exitToJeep * config.WalkDetourFactor,
                            Type = EdgeType.Walk,
                        });
                    }
                }

                // --- Station → VIRTUAL_END (ride, if destination inside region) ---
                if (endInRegion)
                {
                    var rideDist = GeoUtils.HaversineMeters(station.Point, end) * config.TricycleDetourFactor;
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
                    var rideDist = GeoUtils.HaversineMeters(station.Point, boundaryDropoff.Value) * config.TricycleDetourFactor;
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
                        new LatLng(jeepNode.Lat, jeepNode.Lng), station.Point) * config.WalkDetourFactor;

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

            }

            // --- First-mile: direct tricycle hail from origin (if inside region) ---
            // Tricycles can be hailed from any point inside the region — no walk to a station
            // is required. Edges connect __start__ directly to boundary exits (for jeepneys
            // outside the region) and to jeepney nodes inside the region. StationPoint is
            // intentionally omitted so LegAssembler routes the tricycle from the actual origin
            // rather than injecting a walk-to-station leg before the ride.
            if (startInRegion && (boundaryExitNodes.Count > 0 || jeepneyNodesInRegion.Count > 0))
            {
                if (!baseEdges.TryGetValue(RoutingConstants.VirtualStartId, out var fmEdges))
                {
                    fmEdges = [];
                    baseEdges[RoutingConstants.VirtualStartId] = fmEdges;
                }

                TransitStation? nearestToStart = null;
                var nearestToStartDist = double.MaxValue;
                foreach (var s in availableStations)
                {
                    var d = GeoUtils.HaversineMeters(start, s.Point);
                    if (d < nearestToStartDist) { nearestToStart = s; nearestToStartDist = d; }
                }

                // __start__ → boundary exit (hail from origin, no StationPoint)
                foreach (var (exitId, exitPt) in boundaryExitNodes)
                {
                    var rideDist = GeoUtils.HaversineMeters(start, exitPt) * config.TricycleDetourFactor;
                    fmEdges.Add(new BaseEdge
                    {
                        From = RoutingConstants.VirtualStartId,
                        To = exitId,
                        Distance = rideDist,
                        Type = EdgeType.Tricycle,
                        RegionId = region.Id,
                        IsHail = true,
                        StationId = nearestToStart?.Id,
                        StationName = nearestToStart?.Address,
                    });
                }

                // __start__ → jeepney node inside region (short hail only)
                foreach (var jeepNodeId in jeepneyNodesInRegion)
                {
                    var jeepNode = nodes[jeepNodeId];
                    var rideDist = GeoUtils.HaversineMeters(start, new LatLng(jeepNode.Lat, jeepNode.Lng))
                        * config.TricycleDetourFactor;
                    if (rideDist > config.MaxTricycleRideToTransitMeters) continue;
                    fmEdges.Add(new BaseEdge
                    {
                        From = RoutingConstants.VirtualStartId,
                        To = jeepNodeId,
                        Distance = rideDist,
                        Type = EdgeType.Tricycle,
                        RegionId = region.Id,
                        IsHail = true,
                        StationId = nearestToStart?.Id,
                        StationName = nearestToStart?.Address,
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
                    if (directToEnd < config.MaxDirectWalkInsteadOfHailMeters) continue;

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

                    var tricycleFromStation = GeoUtils.HaversineMeters(nearestStation.Point, end) * config.TricycleDetourFactor;

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
                var walkDist = GeoUtils.HaversineMeters(boundaryDropoff.Value, end) * config.WalkDetourFactor;
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

                    var rideDist = GeoUtils.HaversineMeters(start, end) * config.TricycleDetourFactor;
                    startEdges.Add(new BaseEdge
                    {
                        From = RoutingConstants.VirtualStartId,
                        To = RoutingConstants.VirtualEndId,
                        Distance = rideDist,
                        Type = EdgeType.Tricycle,
                        StationId = nearestStation.Id,
                        StationName = nearestStation.Address,
                        RegionId = region.Id,
                        IsHail = true,
                    });
                }
            }
        }
    }

    /// <summary>
    /// Issue parallel OSRM foot distance queries for all candidate access and egress nodes,
    /// then inject virtual start and end nodes into the graph. Results are filtered to exclude
    /// unreachable destinations (<see cref="double.PositiveInfinity"/>).
    /// </summary>
    /// <remarks>
    /// Access candidates: up to <see cref="RoutingConfig.AccessCandidatesPerDirection"/> nodes
    /// per route direction within <see cref="RoutingConfig.MaxTransitProximityMeters"/>, capped
    /// at <see cref="RoutingConfig.MaxAccessQueries"/> total OSRM calls.
    /// Egress candidates are computed symmetrically.
    /// </remarks>
    /// <param name="start">Trip origin coordinate.</param>
    /// <param name="end">Trip destination coordinate.</param>
    /// <param name="routes">All active routes; used to select candidate directions.</param>
    /// <param name="nodes">Node dictionary mutated to add the virtual start/end nodes.</param>
    /// <param name="config">Routing config supplying candidate limits and proximity thresholds.</param>
    /// <returns>
    /// A tuple of (Access, Egress) dictionaries mapping node ID to walk distance in metres.
    /// </returns>
    private async Task<(Dictionary<string, double> Access, Dictionary<string, double> Egress)>
        QueryUserNodeDistancesAsync(
            LatLng start,
            LatLng end,
            List<TransitRoute> routes,
            Dictionary<string, GraphNode> nodes,
            RoutingConfig config)
    {
        // Ensure virtual nodes exist
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

        // --- ACCESS candidates ---
        var accessDegThreshold = config.MaxTransitProximityMeters / 111_320.0;
        var candidatesByGroup = new Dictionary<string, List<(string NodeId, double GeoDist)>>();

        foreach (var (nodeId, node) in nodes)
        {
            if (node.RouteId == "__virtual__") continue;
            if (Math.Abs(node.Lat - start.Lat) > accessDegThreshold) continue;
            if (Math.Abs(node.Lng - start.Lng) > accessDegThreshold * 1.5) continue;

            var dist = GeoUtils.HaversineMeters(new LatLng(node.Lat, node.Lng), start);
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
        accessCandidates.Sort((a, b) => a.GeoDist.CompareTo(b.GeoDist));
        var cappedAccess = accessCandidates.Take(config.MaxAccessQueries).ToList();

        // Query OSRM foot in parallel
        var accessTasks = cappedAccess.Select(async c =>
        {
            var node = nodes[c.NodeId];
            var d = await _walk.DistanceAsync(start, new LatLng(node.Lat, node.Lng));
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
        var egressDegThreshold = config.MaxTransitProximityMeters / 111_320.0;
        var egressByGroup = new Dictionary<string, List<(string NodeId, double GeoDist)>>();

        foreach (var (nodeId, node) in nodes)
        {
            if (node.RouteId == "__virtual__") continue;
            if (Math.Abs(node.Lat - end.Lat) > egressDegThreshold) continue;
            if (Math.Abs(node.Lng - end.Lng) > egressDegThreshold * 1.5) continue;

            var dist = GeoUtils.HaversineMeters(new LatLng(node.Lat, node.Lng), end);
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
        egressCandidates.Sort((a, b) => a.GeoDist.CompareTo(b.GeoDist));
        var cappedEgress = egressCandidates.Take(config.MaxEgressQueries).ToList();

        var egressTasks = cappedEgress.Select(async c =>
        {
            var node = nodes[c.NodeId];
            var d = await _walk.DistanceAsync(new LatLng(node.Lat, node.Lng), end);
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
    /// Convert the uncosted <see cref="BaseEdge"/> adjacency list into a fully costed
    /// <see cref="GraphEdge"/> adjacency list ready for A* search. Edge costs are computed
    /// per <paramref name="profile"/> as follows:
    /// <list type="bullet">
    ///   <item><description><see cref="EdgeType.Transit"/>: distance × <see cref="WeightProfile.TransitCostFactor"/> + boarding cost.</description></item>
    ///   <item><description><see cref="EdgeType.Transfer"/>: walk-distance penalty + transfer flat penalty.</description></item>
    ///   <item><description><see cref="EdgeType.Walk"/>: progressive walk cost (linear below comfort threshold, quadratic above).</description></item>
    ///   <item><description><see cref="EdgeType.Tricycle"/>: ride cost + wait penalty + detour and mid-route penalties.</description></item>
    /// </list>
    /// Also injects virtual access edges (start → boarding nodes) and egress edges
    /// (alighting nodes → end). Stop-restricted nodes are skipped for boarding, alighting,
    /// and transfer edges.
    /// </summary>
    /// <param name="baseEdges">Uncosted adjacency list from <see cref="BaseGraph.BaseEdges"/>.</param>
    /// <param name="rawBoardingCosts">Pre-computed per-node boarding wait costs.</param>
    /// <param name="accessDistances">Walk distances from origin to each transit node.</param>
    /// <param name="egressDistances">Walk distances from each transit node to destination.</param>
    /// <param name="nodes">All graph nodes.</param>
    /// <param name="profile">The weight profile to apply when computing costs.</param>
    /// <param name="stopRestrictedNodes">Nodes excluded from boarding/alighting/transfer.</param>
    /// <param name="config">Routing config supplying speed, threshold, and penalty values.</param>
    /// <returns>Costed adjacency list keyed by source node ID.</returns>
    public static Dictionary<string, List<GraphEdge>> BuildCostedAdjacency(
        Dictionary<string, List<BaseEdge>> baseEdges,
        Dictionary<string, double> rawBoardingCosts,
        Dictionary<string, double> accessDistances,
        Dictionary<string, double> egressDistances,
        Dictionary<string, GraphNode> nodes,
        WeightProfile profile,
        HashSet<string> stopRestrictedNodes,
        RoutingConfig? config = null)
    {
        var cfg = config ?? RoutingConfig.FromWeights(AlgorithmWeights.Defaults);
        var adjacency = new Dictionary<string, List<GraphEdge>>();

        // Apply costs to all base edges
        foreach (var (nodeId, edges) in baseEdges)
        {
            var costed = new List<GraphEdge>(edges.Count);

            foreach (var baseEdge in edges)
            {
                // Stop-restricted nodes cannot alight, transfer, walk, or board a tricycle.
                if (baseEdge.Type != EdgeType.Transit && stopRestrictedNodes.Contains(baseEdge.From)) continue;
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
                            ? cfg.HailingWaitPenaltyMeters
                            : cfg.StationWaitPenaltyMeters;
                        cost = baseEdge.Distance * cfg.TricycleRideCostFactor + waitPenalty;

                        if (baseEdge.WalkToStationDist.HasValue)
                            cost += GeoUtils.ProfileWalkCost(baseEdge.WalkToStationDist.Value, profile);

                        if (baseEdge is { IsHail: true, From: not RoutingConstants.VirtualStartId }
                            && baseEdge.To.StartsWith("tricycle:", StringComparison.Ordinal))
                        {
                            cost += cfg.MidRouteTricyclePenaltyMeters;
                        }

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
            // Skip boarding at stop-restricted nodes
            if (stopRestrictedNodes.Contains(nodeId)) continue;
            // Skip tricycle infrastructure — reached via tricycle edges, not walk
            if (node.RouteId.StartsWith("__tricycle_region__:", StringComparison.Ordinal)) continue;
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
            // Skip alighting at stop-restricted nodes
            if (stopRestrictedNodes.Contains(nodeId)) continue;
            // Skip tricycle infrastructure — it connects to __end__ via tricycle edges
            if (nodes.TryGetValue(nodeId, out var egressNode)
                && egressNode.RouteId.StartsWith("__tricycle_region__:", StringComparison.Ordinal)) continue;
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
        var config = _weights.GetConfig();

        return await _cache.GetOrBuildAsync(async () =>
        {
            var transitData = await LoadTransitDataAsync();
            if (transitData.Routes.Count == 0) return null;

            var nodes = BuildGraphNodes(transitData.Routes);
            var baseEdges = BuildBaseTransitEdges(transitData.Routes, nodes);
            BuildBaseTransferEdges(nodes, baseEdges, config);
            MarkClosureEdges(baseEdges, nodes, transitData.Closures);

            var rawBoardingCosts = ComputeRawBoardingCosts(transitData.Routes);
            var stopRestrictedNodes = MarkStopRestrictedNodes(nodes, transitData.Stops, config);

            return new CachedStaticGraph
            {
                TransitData = transitData,
                Nodes = nodes,
                BaseEdges = baseEdges,
                RawBoardingCosts = rawBoardingCosts,
                StopRestrictedNodes = stopRestrictedNodes,
            };
        });
    }

    /// <summary>
    /// Orchestrate the full per-request graph construction:
    /// <list type="number">
    ///   <item><description>Fetch or rebuild the static graph from the in-process cache.</description></item>
    ///   <item><description>Deep-clone the mutable adjacency list and node dictionary so per-request mutations do not pollute the cache.</description></item>
    ///   <item><description>Inject time-filtered tricycle nodes and edges.</description></item>
    ///   <item><description>Issue parallel OSRM foot distance queries for access and egress.</description></item>
    ///   <item><description>Assemble and return the complete <see cref="BaseGraph"/>.</description></item>
    /// </list>
    /// Returns <see langword="null"/> when the static graph cannot be built (e.g. no public routes exist).
    /// </summary>
    /// <param name="start">Trip origin coordinate (WGS-84).</param>
    /// <param name="end">Trip destination coordinate (WGS-84).</param>
    /// <param name="now">UTC time used for tricycle station availability checks. Defaults to <see cref="DateTime.UtcNow"/>.</param>
    /// <param name="config">Routing configuration. Falls back to the live configuration when <see langword="null"/>.</param>
    /// <returns>
    /// A tuple of (<see cref="BaseGraph"/>, <see cref="TransitData"/>) when successful,
    /// or <see langword="null"/> when no graph could be built.
    /// </returns>
    public async Task<(BaseGraph Graph, TransitData Data)?> BuildBaseGraphAsync(
        LatLng start, LatLng end, DateTime? now = null, RoutingConfig? config = null)
    {
        var cfg = config ?? _weights.GetConfig();
        var staticGraph = await GetStaticGraphAsync();
        if (staticGraph == null) return null;

        // Deep-clone the mutable portions so per-request tricycle edges
        // and virtual nodes don't pollute the cached copy
        var nodes = new Dictionary<string, GraphNode>(staticGraph.Nodes);
        var baseEdges = staticGraph.BaseEdges
            .ToDictionary(kv => kv.Key, kv => new List<BaseEdge>(kv.Value));

        // Tricycle station nodes & edges (time-window filtered, depends on start/end)
        BuildTricycleNodesAndEdges(
            staticGraph.TransitData.Regions, nodes, baseEdges, start, end, now ?? DateTime.UtcNow, cfg);

        // Query OSRM foot for real walk distances (expensive I/O — done once)
        var (accessDistances, egressDistances) = await QueryUserNodeDistancesAsync(
            start, end, staticGraph.TransitData.Routes, nodes, cfg);

        var baseGraph = new BaseGraph
        {
            Nodes = nodes,
            BaseEdges = baseEdges,
            RawBoardingCosts = staticGraph.RawBoardingCosts,
            AccessWalkDistances = accessDistances,
            EgressWalkDistances = egressDistances,
            HasAccessEdges = accessDistances.Count > 0,
            HasEgressEdges = egressDistances.Count > 0,
            StopRestrictedNodes = staticGraph.StopRestrictedNodes,
        };

        return (baseGraph, staticGraph.TransitData);
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    /// <summary>
    /// Identifies graph nodes that fall within StopProximityMeters of a stop zone
    /// polyline. Restricted nodes cannot be used for boarding, alighting, or transfers.
    /// Mirrors markStopRestrictedNodes in lib/routing/graph-builder.ts.
    /// </summary>
    private static HashSet<string> MarkStopRestrictedNodes(
        Dictionary<string, GraphNode> nodes,
        List<TransitStop> stops,
        RoutingConfig config)
    {
        var restricted = new HashSet<string>();
        if (stops.Count == 0) return restricted;

        foreach (var (nodeId, node) in nodes)
        {
            if (string.IsNullOrEmpty(node.RouteId)) continue;

            var nodePoint = new LatLng(node.Lat, node.Lng);

            foreach (var stop in stops)
            {
                var dist = DistanceToPolylineMeters(nodePoint, stop.DecodedPolyline);
                if (dist > config.StopProximityMeters) continue;

                // Check direction match
                var directionMatches =
                    stop.DisallowedDirection == DisallowedDirection.Both ||
                    (stop.DisallowedDirection == DisallowedDirection.DirectionTo && node.Direction == RouteDirection.GoingTo) ||
                    (stop.DisallowedDirection == DisallowedDirection.DirectionBack && node.Direction == RouteDirection.GoingBack);

                if (!directionMatches) continue;

                if (stop.RestrictionType == RestrictionType.Universal)
                {
                    restricted.Add(nodeId);
                    break;
                }

                if (stop.RestrictionType == RestrictionType.Specific && stop.RouteIds.Contains(node.RouteId))
                {
                    restricted.Add(nodeId);
                    break;
                }
            }
        }

        return restricted;
    }

    /// <summary>
    /// Computes the minimum haversine distance (meters) from a point to any
    /// segment of the given polyline.
    /// </summary>
    private static double DistanceToPolylineMeters(LatLng point, List<LatLng> polyline)
    {
        var minDist = double.MaxValue;

        for (var i = 0; i < polyline.Count - 1; i++)
        {
            var segA = polyline[i];
            var segB = polyline[i + 1];
            var d = DistanceToSegmentMeters(point, segA, segB);
            if (d < minDist) minDist = d;
        }

        return minDist;
    }

    /// <summary>
    /// Minimum haversine distance (meters) from a point to a line segment [a, b].
    /// Projects point onto the segment in flat lat/lng space, then measures
    /// haversine to the projected (or endpoint) result.
    /// </summary>
    private static double DistanceToSegmentMeters(LatLng p, LatLng a, LatLng b)
    {
        var dx = b.Lng - a.Lng;
        var dy = b.Lat - a.Lat;
        var lenSq = dx * dx + dy * dy;

        if (lenSq == 0)
            return GeoUtils.HaversineMeters(p, a);

        var t = Math.Clamp(((p.Lng - a.Lng) * dx + (p.Lat - a.Lat) * dy) / lenSq, 0, 1);
        var nearest = new LatLng(a.Lat + t * dy, a.Lng + t * dx);
        return GeoUtils.HaversineMeters(p, nearest);
    }

    /// <summary>
    /// Determine whether a tricycle station is currently operational based on its time window.
    /// Handles windows that wrap across midnight (e.g. 22:00–06:00).
    /// </summary>
    /// <param name="station">The station with <c>AvailableFrom</c>/<c>AvailableTo</c> strings in <c>HH:mm</c> format.</param>
    /// <param name="now">The current UTC time to compare against the window.</param>
    /// <returns><see langword="true"/> when the current time falls within the station's operating window.</returns>
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

    /// <summary>
    /// Return all stations in <paramref name="region"/> that are currently within their operating window.
    /// If the fraction of unavailable stations meets or exceeds
    /// <see cref="RoutingConfig.StationUnavailabilityThreshold"/>, the entire region is considered
    /// offline and an empty list is returned.
    /// </summary>
    private static List<TransitStation> GetAvailableStations(TransitRegion region, DateTime now, RoutingConfig config)
    {
        if (region.Stations.Count == 0) return [];
        var available = region.Stations.Where(s => IsStationAvailable(s, now)).ToList();
        var unavailableRatio = 1.0 - (double)available.Count / region.Stations.Count;
        if (unavailableRatio >= config.StationUnavailabilityThreshold) return [];
        return available;
    }

    /// <summary>
    /// Build a closed NTS <see cref="Polygon"/> from a region's ordered boundary points.
    /// Returns <see langword="null"/> when the region has fewer than three boundary points.
    /// </summary>
    private static Polygon? BuildRegionPolygon(GeometryFactory factory, TransitRegion region)
    {
        var sorted = region.Points.OrderBy(p => p.Sequence).ToList();
        if (sorted.Count < 3) return null;
        var ring = sorted.Select(p => new Coordinate(p.Point.Lng, p.Point.Lat)).ToList();
        ring.Add(ring[0]); // close ring
        return factory.CreatePolygon(ring.ToArray());
    }

    /// <summary>
    /// Find the nearest point on a region's boundary ring to <paramref name="target"/>.
    /// Used to project a user's position onto the region boundary when constructing
    /// tricycle boundary exit nodes.
    /// </summary>
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
