using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Navigator.V3.Types;
using Microsoft.Extensions.Caching.Memory;

namespace JippyServices.Algorithm.Navigator.V3;

/// <summary>In-process cache for the V3 static stop-based transit graph.</summary>
internal interface ITransitDataCacheV3
{
    Task<CachedStaticGraphV3?> GetOrBuildAsync(Func<Task<CachedStaticGraphV3?>> factory);
    Task InvalidateAsync();
}

internal sealed class TransitDataCacheV3 : ITransitDataCacheV3
{
    private readonly IMemoryCache _cache;
    private readonly ILogger<TransitDataCacheV3> _logger;
    private const string CacheKey = "transit_static_graph_v3";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    public TransitDataCacheV3(IMemoryCache cache, ILogger<TransitDataCacheV3> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    public async Task<CachedStaticGraphV3?> GetOrBuildAsync(Func<Task<CachedStaticGraphV3?>> factory)
    {
        if (_cache.TryGetValue<CachedStaticGraphV3>(CacheKey, out var cached))
        {
            _logger.LogDebug("Transit V3 static graph cache HIT");
            return cached;
        }

        _logger.LogDebug("Transit V3 static graph cache MISS — building from DB");
        var result = await factory();
        if (result == null) return null;

        _cache.Set(CacheKey, result, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = CacheTtl,
        });
        _logger.LogDebug("Transit V3 static graph cached (TTL {Ttl})", CacheTtl);
        return result;
    }

    public Task InvalidateAsync()
    {
        _cache.Remove(CacheKey);
        _logger.LogInformation("Transit V3 static graph cache invalidated");
        return Task.CompletedTask;
    }
}

/// <summary>
/// Static portion of the V3 graph — independent of user start/end.
/// </summary>
internal sealed class CachedStaticGraphV3
{
    public required TransitDataV3 TransitData { get; init; }
    public required Dictionary<string, GraphNode> Nodes { get; init; }
    public required Dictionary<string, List<BaseEdge>> BaseEdges { get; init; }
    public required Dictionary<string, double> RawBoardingCosts { get; init; }
    public required Dictionary<string, StopPoint> BoardingNodes { get; init; }
}
