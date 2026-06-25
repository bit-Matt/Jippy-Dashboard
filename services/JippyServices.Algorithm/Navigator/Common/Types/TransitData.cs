namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// A snapshot of all transit data loaded from the database for a single graph build.
/// Contains routes, tricycle regions, road closures, and boarding restriction zones.
/// </summary>
internal sealed class TransitData
{
    /// <summary>All public jeepney routes with an active snapshot.</summary>
    public required List<TransitRoute> Routes { get; init; }

    /// <summary>All public tricycle regions with their stations.</summary>
    public required List<TransitRegion> Regions { get; init; }

    /// <summary>Active road closure polygons that penalise affected edges.</summary>
    public required List<TransitClosure> Closures { get; init; }

    /// <summary>Boarding/alighting restriction zones (no-stop areas).</summary>
    public required List<TransitStop> Stops { get; init; }
}

/// <summary>
/// A jeepney route with both directional polylines pre-decoded into coordinate lists.
/// </summary>
internal sealed class TransitRoute
{
    /// <summary>Database ID of the route.</summary>
    public required string Id { get; init; }

    /// <summary>Route number displayed on the vehicle (e.g. "01A").</summary>
    public required string RouteNumber { get; init; }

    /// <summary>Full route name displayed in the app (e.g. "Cogon - Bulua").</summary>
    public required string RouteName { get; init; }

    /// <summary>Hex colour string used to render this route on the map.</summary>
    public required string RouteColor { get; init; }

    /// <summary>
    /// Number of vehicles in the fleet. Used to estimate boarding wait time —
    /// a larger fleet means shorter average headway.
    /// </summary>
    public required int FleetCount { get; init; }

    /// <summary>Google-encoded polyline (precision 1e6) for the GoingTo direction.</summary>
    public required string PolylineGoingTo { get; init; }

    /// <summary>Google-encoded polyline (precision 1e6) for the GoingBack direction.</summary>
    public required string PolylineGoingBack { get; init; }

    /// <summary>Pre-decoded coordinate list for the GoingTo direction.</summary>
    public required List<LatLng> DecodedGoingTo { get; init; }

    /// <summary>Pre-decoded coordinate list for the GoingBack direction.</summary>
    public required List<LatLng> DecodedGoingBack { get; init; }
}

/// <summary>
/// A tricycle station within a <see cref="TransitRegion"/>, operating during a defined time window.
/// </summary>
internal sealed class TransitStation
{
    /// <summary>Database ID of the station.</summary>
    public required string Id { get; init; }

    /// <summary>Human-readable address of the station (e.g. "Corner Pabayo - Corrales").</summary>
    public required string Address { get; init; }

    /// <summary>
    /// Time string (HH:mm) from which this station is operational.
    /// Compared against UTC time during graph construction to filter inactive stations.
    /// </summary>
    public required string AvailableFrom { get; init; }

    /// <summary>
    /// Time string (HH:mm) until which this station is operational.
    /// Compared against UTC time during graph construction to filter inactive stations.
    /// </summary>
    public required string AvailableTo { get; init; }

    /// <summary>Geographic position of the station (WGS-84).</summary>
    public required LatLng Point { get; init; }
}

/// <summary>
/// A tricycle operating region, defined by a polygon and containing a set of stations.
/// </summary>
internal sealed class TransitRegion
{
    /// <summary>Database ID of the region.</summary>
    public required string Id { get; init; }

    /// <summary>Display name of the tricycle region (e.g. "Divisoria Area").</summary>
    public required string RegionName { get; init; }

    /// <summary>Hex colour string used to render this region on the map.</summary>
    public required string RegionColor { get; init; }

    /// <summary>
    /// Encoded shape string describing the region boundary.
    /// Used to determine whether a point lies inside the region.
    /// </summary>
    public required string RegionShape { get; init; }

    /// <summary>Ordered polygon boundary points for the region.</summary>
    public required List<RegionPoint> Points { get; init; }

    /// <summary>Tricycle stations located inside this region.</summary>
    public required List<TransitStation> Stations { get; init; }
}

/// <summary>
/// A single ordered vertex of a polygon boundary (used for both regions and closures).
/// </summary>
internal sealed class RegionPoint
{
    /// <summary>Database ID of this boundary point.</summary>
    public required string Id { get; init; }

    /// <summary>Position within the boundary polygon (0-based, ascending).</summary>
    public required int Sequence { get; init; }

    /// <summary>Geographic coordinate of this boundary vertex (WGS-84).</summary>
    public required LatLng Point { get; init; }
}

/// <summary>
/// An active road closure defined by a polygon. Transit graph edges whose midpoints
/// fall inside this polygon receive a configurable cost penalty.
/// </summary>
internal sealed class TransitClosure
{
    /// <summary>Database ID of the closure.</summary>
    public required string Id { get; init; }

    /// <summary>Human-readable description of the closure (e.g. "Corrales Ave. Construction").</summary>
    public required string ClosureName { get; init; }

    /// <summary>Ordered polygon boundary points defining the closure area.</summary>
    public required List<RegionPoint> Points { get; init; }
}

/// <summary>Restriction scope for a stop zone.</summary>
public enum RestrictionType
{
    Universal,  // all routes
    Specific,   // only listed route IDs
}

/// <summary>Direction(s) in which a stop zone restricts boarding/alighting.</summary>
public enum DisallowedDirection
{
    DirectionTo,
    DirectionBack,
    Both,
}

/// <summary>
/// A no-boarding / no-alighting zone defined by a decoded polyline.
/// Graph nodes within StopProximityMeters of this line are restricted.
/// </summary>
internal sealed class TransitStop
{
    public required string Id { get; init; }
    public required RestrictionType RestrictionType { get; init; }
    public required DisallowedDirection DisallowedDirection { get; init; }
    /// <summary>Decoded polyline coordinates [lat, lng] defining the stop zone.</summary>
    public required List<LatLng> DecodedPolyline { get; init; }
    /// <summary>Route IDs that are restricted (only used when RestrictionType is Specific).</summary>
    public required List<string> RouteIds { get; init; }
}
