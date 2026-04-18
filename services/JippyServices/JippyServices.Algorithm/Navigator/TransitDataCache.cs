using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Caches the "static" portion of the transit graph that is identical across
// all navigation requests: transit data from DB + graph nodes + transit edges
// + transfer edges + closure markings + boarding costs.
//
// This eliminates repeated DB queries and O(n²) transfer-edge computation
// on every request. The cache is invalidated by a short TTL; in a real-time
// dashboard the admin edits routes/regions/closures infrequently compared
// to the volume of navigation queries.
// -------------------------------------------------------------------------

public sealed class TransitDataCache(
    IDistributedCache cache,
    ILogger<TransitDataCache> logger)
{
    private const string CacheKey = "transit_static_graph";

    /// <summary>How long the static graph stays valid before a DB refresh.</summary>
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>
    /// Get the cached static graph, or build it from the database and store it.
    /// Returns the transit data + precomputed graph pieces that are reusable
    /// across all coordinate pairs.
    /// </summary>
    public async Task<CachedStaticGraph?> GetOrBuildAsync(Func<Task<CachedStaticGraph?>> factory)
    {
        try
        {
            var cached = await cache.GetAsync(CacheKey);
            if (cached is { Length: > 0 })
            {
                logger.LogDebug("Transit static graph cache HIT");
                var deserialized = JsonSerializer.Deserialize<CachedStaticGraph>(cached, JsonOptions);
                if (deserialized != null) return deserialized;
            }
        }
        catch (Exception ex)
        {
            // Redis down — fall through to build from DB
            logger.LogWarning(ex, "Redis read failed for transit static graph, building from DB");
        }

        logger.LogDebug("Transit static graph cache MISS — building from DB");
        var result = await factory();
        if (result == null) return null;

        try
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(result, JsonOptions);
            await cache.SetAsync(CacheKey, bytes, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = CacheTtl,
            });
            logger.LogDebug("Transit static graph cached ({Size} bytes, TTL {Ttl})", bytes.Length, CacheTtl);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis write failed for transit static graph");
        }

        return result;
    }

    /// <summary>
    /// Force-invalidate the cached graph. Call this from an admin webhook
    /// when routes/regions/closures are edited.
    /// </summary>
    public async Task InvalidateAsync()
    {
        try
        {
            await cache.RemoveAsync(CacheKey);
            logger.LogInformation("Transit static graph cache invalidated");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis remove failed for transit static graph");
        }
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
