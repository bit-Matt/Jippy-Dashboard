namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>
/// A node in the transit graph. Each node corresponds to one vertex of
/// a decoded polyline for a specific route and direction.
/// </summary>
internal sealed class GraphNode
{
    /// <summary>
    /// Unique node identifier, typically formatted as
    /// <c>"{routeId}_{direction}_{polylineIndex}"</c>, or a special value such as
    /// <c>"__virtual_start__"</c> / <c>"__virtual_end__"</c>.
    /// </summary>
    public required string Id { get; init; }

    /// <summary>Latitude of this polyline vertex in decimal degrees (WGS-84).</summary>
    public required double Lat { get; init; }

    /// <summary>Longitude of this polyline vertex in decimal degrees (WGS-84).</summary>
    public required double Lng { get; init; }

    /// <summary>Database ID of the jeepney route this node belongs to.</summary>
    public required string RouteId { get; init; }

    /// <summary>Display name of the route (e.g. "Cogon - Bulua").</summary>
    public required string RouteName { get; init; }

    /// <summary>Route number shown on the vehicle (e.g. "01A").</summary>
    public required string RouteNumber { get; init; }

    /// <summary>Hex colour string used to render this route on the map.</summary>
    public required string RouteColor { get; init; }

    /// <summary>Whether this node is on the GoingTo or GoingBack polyline of its route.</summary>
    public required RouteDirection Direction { get; init; }

    /// <summary>
    /// Zero-based index of this node within the decoded route polyline.
    /// Used to determine boarding/alighting order along the route.
    /// </summary>
    public required int PolylineIndex { get; init; }
}
