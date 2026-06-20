// ReSharper disable ClassNeverInstantiated.Global

using JippyServices.Algorithm.Data;
using JippyServices.Algorithm.Navigator;
using JippyServices.Algorithm.Navigator.Clients;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<DataContext>(options =>
{
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        b => b.UseNetTopologySuite());
});

// Redis
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("RedisCache");
    options.InstanceName = "Jippy_Algorithm_";
});

// In-process memory cache for the static transit graph.
builder.Services.AddMemoryCache();

// HTTP clients for external routing services
builder.Services.AddHttpClient<OsrmWalkClient>();
builder.Services.AddHttpClient<OsrmClient>();
builder.Services.AddHttpClient<NominatimClient>();

// Navigator services
builder.Services.AddSingleton<WeightsManager>();
builder.Services.AddSingleton<TransitDataCache>();
builder.Services.AddScoped<GraphBuilder>();
builder.Services.AddScoped<InstructionGenerator>();
builder.Services.AddScoped<LegAssembler>();
builder.Services.AddScoped<NavigationService>();

var app = builder.Build();

app.MapPost("/navigate", async (NavigationRequest request, NavigationService nav, WeightsManager weights) =>
{
    var start = new LatLng(request.Start.Lat, request.Start.Lng);
    var end = new LatLng(request.End.Lat, request.End.Lng);
    var config = weights.GetConfig();

    var result = await nav.ComputeRouteAsync(start, end, config);
    return Results.Ok(result);
});

app.MapPost("/navigate/simulate", async (SimulationRequest request, NavigationService nav, WeightsManager weights) =>
{
    var start = new LatLng(request.Start.Lat, request.Start.Lng);
    var end = new LatLng(request.End.Lat, request.End.Lng);
    var config = weights.GetConfig().WithOverrides(request.Overrides);

    var result = await nav.ComputeRouteAsync(start, end, config);
    return Results.Ok(result);
});

app.MapGet("/weights", (WeightsManager weights) => Results.Ok(weights.Current));

app.MapPut("/weights", async (AlgorithmWeights body, WeightsManager weights, TransitDataCache transitCache) =>
{
    weights.Update(body);
    await transitCache.InvalidateAsync();
    return Results.Ok(new { message = "Weights updated" });
});

// Called by the dashboard when routes/regions/closures are edited
app.MapPost("/cache/invalidate", async (TransitDataCache transitCache) =>
{
    await transitCache.InvalidateAsync();
    return Results.Ok(new { message = "Transit cache invalidated" });
});

await app.RunAsync();

internal sealed class NavigationRequest
{
    [JsonPropertyName("start")]
    public LatLngObject Start { get; init; } = null!;

    [JsonPropertyName("end")]
    public LatLngObject End { get; init; } = null!;
}

internal sealed class SimulationRequest
{
    [JsonPropertyName("start")]
    public LatLngObject Start { get; init; } = null!;

    [JsonPropertyName("end")]
    public LatLngObject End { get; init; } = null!;

    [JsonPropertyName("overrides")]
    public SimulationOverrides? Overrides { get; init; }
}

internal sealed class LatLngObject
{
    [JsonPropertyName("lat")]
    public double Lat { get; init; }

    [JsonPropertyName("lng")]
    public double Lng { get; init; }
}
