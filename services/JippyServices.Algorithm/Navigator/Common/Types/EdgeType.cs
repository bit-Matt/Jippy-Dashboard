namespace JippyServices.Algorithm.Navigator.Common.Types;

/// <summary>Classifies the movement type represented by a graph edge.</summary>
internal enum EdgeType
{
    /// <summary>
    /// Movement along a jeepney route polyline between two consecutive nodes
    /// (on-vehicle travel).
    /// </summary>
    Transit,

    /// <summary>
    /// A walk between the alighting point of one jeepney route and the
    /// boarding point of another (an interchange).
    /// </summary>
    Transfer,

    /// <summary>
    /// On-foot access (start → first boarding node) or egress
    /// (last alighting node → destination) walk.
    /// </summary>
    Walk,

    /// <summary>
    /// Tricycle (motorcycle sidecar) segment used for first-mile or last-mile travel
    /// within a tricycle region.
    /// </summary>
    Tricycle,
}
