using JippyServices.Algorithm.Navigator.Common.Types;
using Microsoft.Extensions.Caching.Memory;

namespace JippyServices.Algorithm.Navigator.Cache;

/// <summary>
/// Caches the "static" portion of the transit graph that is identical across
/// all navigation requests: transit data from DB + graph nodes + transit edges
/// + transfer edges + closure markings + boarding costs.
///
/// IMemoryCache is used deliberately (not IDistributedCache) to store the
/// live object graph by reference, avoiding the hundreds of MB of JSON
/// serialization overhead that IDistributedCache requires on every read/write.
/// </summary>
internal sealed class TransitDataCache : ITransitDataCache
{
    private readonly IMemoryCache _cache;
    private readonly ILogger<TransitDataCache> _logger;
    
    private const string CacheKey = "transit_static_graph";

    /// <summary>How long the static graph stays valid before a DB refresh.</summary>
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    public TransitDataCache(IMemoryCache cache, ILogger<TransitDataCache> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Get the cached static graph, or build it from the database and store it.
    /// </summary>
    public async Task<CachedStaticGraph?> GetOrBuildAsync(Func<Task<CachedStaticGraph?>> factory)
    {
        if (_cache.TryGetValue<CachedStaticGraph>(CacheKey, out var cached))
        {
            _logger.LogDebug("Transit static graph cache HIT");
            return cached;
        }

        _logger.LogDebug("Transit static graph cache MISS — building from DB");
        var result = await factory();
        if (result == null) return null;

        _cache.Set(CacheKey, result, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = CacheTtl,
        });
        _logger.LogDebug("Transit static graph cached (TTL {Ttl})", CacheTtl);

        return result;
    }

    /// <summary>
    /// Force-invalidate the cached graph. Call this from an admin webhook
    /// when routes/regions/closures are edited.
    /// </summary>
    public Task InvalidateAsync()
    {
        _cache.Remove(CacheKey);
        _logger.LogInformation("Transit static graph cache invalidated");
        return Task.CompletedTask;
    }
}

/// <summary>
/// The static portion of the transit graph — everything that is independent
/// of the user's start/end coordinates. Serializable to Redis.
/// </summary>
/// <summary>
/// The portion of the transit graph that is independent of the user's start/end coordinates.
/// Held in <see cref="IMemoryCache"/> by reference to avoid JSON serialisation overhead.
/// Rebuilt from the database on a cache miss or after an explicit <see cref="ITransitDataCache.InvalidateAsync"/> call.
/// </summary>
internal sealed class CachedStaticGraph
{
    /// <summary>Raw transit data snapshot loaded from the database (routes, regions, closures, stops).</summary>
    public required TransitData TransitData { get; init; }

    /// <summary>All transit graph nodes keyed by node ID, built from the decoded route polylines.</summary>
    public required Dictionary<string, GraphNode> Nodes { get; init; }

    /// <summary>
    /// Uncosted adjacency list built from transit, transfer, and tricycle edges.
    /// Access and egress virtual edges are added per-request on top of this base.
    /// </summary>
    public required Dictionary<string, List<BaseEdge>> BaseEdges { get; init; }

    /// <summary>
    /// Per-node raw boarding wait cost in metres, computed from fleet count and service frequency.
    /// Applied during <see cref="GraphBuilder.BuildCostedAdjacency"/> to model boarding delay.
    /// </summary>
    public required Dictionary<string, double> RawBoardingCosts { get; init; }

    /// <summary>
    /// Set of node IDs that fall within a boarding restriction zone.
    /// Boarding, alighting, and transfer edges are suppressed for these nodes.
    /// </summary>
    public required HashSet<string> StopRestrictedNodes { get; init; }
}
