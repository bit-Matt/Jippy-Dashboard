using JippyServices.Algorithm.Navigator.Common.Types;

namespace JippyServices.Algorithm.Navigator.V3.Types;

/// <summary>A public fixed stop from the <c>stops</c> table.</summary>
internal sealed class StopPoint
{
    public required string Id { get; init; }
    public required int Number { get; init; }
    public required string Address { get; init; }
    public required LatLng Point { get; init; }
}

/// <summary>
/// Transit snapshot for NavigatorV3: routes, region polygons (labeling only),
/// closures, and public stops. No region stations / restricted boarding zones.
/// </summary>
internal sealed class TransitDataV3
{
    public required List<TransitRoute> Routes { get; init; }
    public required List<TransitRegion> Regions { get; init; }
    public required List<TransitClosure> Closures { get; init; }
    public required List<StopPoint> Stops { get; init; }
}

/// <summary>
/// Per-request base graph for V3. Boarding / alighting / transfers are limited
/// to nodes that snapped to a real <see cref="StopPoint"/>.
/// </summary>
internal sealed class BaseGraphV3
{
    public required Dictionary<string, GraphNode> Nodes { get; init; }
    public required Dictionary<string, List<BaseEdge>> BaseEdges { get; init; }
    public required Dictionary<string, double> RawBoardingCosts { get; init; }
    public required Dictionary<string, double> AccessWalkDistances { get; init; }
    public required Dictionary<string, double> EgressWalkDistances { get; init; }
    public required bool HasAccessEdges { get; init; }
    public required bool HasEgressEdges { get; init; }

    /// <summary>
    /// Graph node IDs that correspond to a snapped public stop (eligible for
    /// access, egress, and transfers).
    /// </summary>
    public required Dictionary<string, StopPoint> BoardingNodes { get; init; }

    /// <summary>Whether the trip origin lies inside any tricycle region polygon.</summary>
    public required bool StartInRegion { get; init; }

    /// <summary>Whether the trip destination lies inside any tricycle region polygon.</summary>
    public required bool EndInRegion { get; init; }
}
