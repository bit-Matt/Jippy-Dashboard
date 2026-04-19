using Microsoft.Extensions.Caching.Memory;

namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Caches the "static" portion of the transit graph that is identical across
// all navigation requests: transit data from DB + graph nodes + transit edges
// + transfer edges + closure markings + boarding costs.
//
// IMemoryCache is used deliberately (not IDistributedCache) to store the
// live object graph by reference, avoiding the hundreds of MB of JSON
// serialization overhead that IDistributedCache requires on every read/write.
// -------------------------------------------------------------------------

public sealed class TransitDataCache(
    IMemoryCache cache,
    ILogger<TransitDataCache> logger)
{
    private const string CacheKey = "transit_static_graph";

    /// <summary>How long the static graph stays valid before a DB refresh.</summary>
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    /// <summary>
    /// Get the cached static graph, or build it from the database and store it.
    /// </summary>
    public async Task<CachedStaticGraph?> GetOrBuildAsync(Func<Task<CachedStaticGraph?>> factory)
    {
        if (cache.TryGetValue<CachedStaticGraph>(CacheKey, out var cached))
        {
            logger.LogDebug("Transit static graph cache HIT");
            return cached;
        }

        logger.LogDebug("Transit static graph cache MISS — building from DB");
        var result = await factory();
        if (result == null) return null;

        cache.Set(CacheKey, result, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = CacheTtl,
        });
        logger.LogDebug("Transit static graph cached (TTL {Ttl})", CacheTtl);

        return result;
    }

    /// <summary>
    /// Force-invalidate the cached graph. Call this from an admin webhook
    /// when routes/regions/closures are edited.
    /// </summary>
    public Task InvalidateAsync()
    {
        cache.Remove(CacheKey);
        logger.LogInformation("Transit static graph cache invalidated");
        return Task.CompletedTask;
    }
}

/// <summary>
/// The static portion of the transit graph — everything that is independent
/// of the user's start/end coordinates. Serializable to Redis.
/// </summary>
public sealed class CachedStaticGraph
{
    public required TransitData TransitData { get; init; }
    public required Dictionary<string, GraphNode> Nodes { get; init; }
    public required Dictionary<string, List<BaseEdge>> BaseEdges { get; init; }
    public required Dictionary<string, double> RawBoardingCosts { get; init; }
}
