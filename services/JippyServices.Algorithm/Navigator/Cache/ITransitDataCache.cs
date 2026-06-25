namespace JippyServices.Algorithm.Navigator.Cache;

/// <summary>
/// In-process cache for the static transit graph.
/// The graph is built once from the database and held in memory for up to two minutes,
/// or until explicitly invalidated (e.g. after a route or region edit).
/// </summary>
internal interface ITransitDataCache
{
    /// <summary>
    /// Return the currently cached static graph, or build a new one by invoking
    /// <paramref name="factory"/> when the cache is empty or has expired.
    /// </summary>
    /// <param name="factory">
    /// Async delegate that queries the database and builds a fresh <see cref="CachedStaticGraph"/>.
    /// Called only on a cache miss.
    /// </param>
    /// <returns>The cached or freshly built graph, or <see langword="null"/> if the factory returns null.</returns>
    public Task<CachedStaticGraph?> GetOrBuildAsync(Func<Task<CachedStaticGraph?>> factory);

    /// <summary>
    /// Remove the cached static graph so that the next call to <see cref="GetOrBuildAsync"/> rebuilds it.
    /// Called after route, region, or closure data is modified via the dashboard.
    /// </summary>
    public Task InvalidateAsync();
}
