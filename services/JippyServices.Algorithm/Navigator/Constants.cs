namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Routing algorithm fixed parameters (not managed by WeightsManager)
// -------------------------------------------------------------------------

public static class RoutingConstants
{
    /// <summary>Maximum A* iterations before giving up.</summary>
    public const int MaxAStarIterations = 50_000;

    /// <summary>Virtual node ID for the user's start point.</summary>
    public const string VirtualStartId = "__start__";

    /// <summary>Virtual node ID for the user's destination.</summary>
    public const string VirtualEndId = "__end__";
}
