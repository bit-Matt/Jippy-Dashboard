// ReSharper disable ClassNeverInstantiated.Global

using JippyServices.Algorithm.Data;
using Microsoft.EntityFrameworkCore;
using JippyServices.Algorithm.Api;
using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Contracts.V2.Requests;
using JippyServices.Algorithm.Navigator;
using JippyServices.Algorithm.Navigator.Cache;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Navigator.V2;
using JippyServices.Algorithm.Navigator.V2MarkTwo;
using JippyServices.Algorithm.Weights;
using Refit;

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

// Request clients
builder.Services
    .AddRefitClient<INominatimClient>()
    .ConfigureHttpClient(c =>
    {
        var url = builder.Configuration["Services:Nominatim"];

        // Url not configured.
        if (string.IsNullOrEmpty(url))
        {
            throw new InvalidOperationException("Services:Nominatim not configured.");
        }

        c.BaseAddress = new(url);
    });

// Refit encodes ',' and ';' in path parameters; OSRM requires them literal.
builder.Services.AddTransient<OsrmCoordinatePathHandler>();

builder.Services
    .AddKeyedRefitClient<IOSRMApiClient>("bicycle")
    .AddHttpMessageHandler<OsrmCoordinatePathHandler>()
    .ConfigureHttpClient(c =>
    {
        var url = builder.Configuration["Services:OSRM:Bicycle"];

        if (string.IsNullOrEmpty(url))
        {
            throw new InvalidOperationException("Services:OSRM:Bicycle not configured.");
        }
        
        c.BaseAddress = new(url);
    });

builder.Services
    .AddKeyedRefitClient<IOSRMApiClient>("foot")
    .AddHttpMessageHandler<OsrmCoordinatePathHandler>()
    .ConfigureHttpClient(c =>
    {
        var url = builder.Configuration["Services:OSRM:Foot"];

        if (string.IsNullOrEmpty(url))
        {
            throw new InvalidOperationException("Services:OSRM:Foot not configured.");
        }

        c.BaseAddress = new(url);
    });

// In-process memory cache for the static transit graph.
builder.Services.AddMemoryCache();

// Service Clients
builder.Services.AddSingleton<INominatimServiceClient, NominatimServiceClient>();
builder.Services.AddSingleton<IWeightsManager, WeightsManager>();
builder.Services.AddKeyedSingleton<IOSRMClient, OSRMBicycleClient>("osrm_bicycle");
builder.Services.AddKeyedSingleton<IOSRMClient, OSRMWalkClient>("osrm_foot");
builder.Services.AddSingleton<ITransitDataCache, TransitDataCache>();

// Navigators
builder.Services.AddKeyedScoped<INavigator, NavigatorV2>("navigator_v2");
builder.Services.AddKeyedScoped<INavigator, NavigatorV2MarkTwo>("navigator_v2MarkII");

var app = builder.Build();

app.MapPost("/navigate/v2", async (
    NavigationRequest request, 
    [FromKeyedServices("navigator_v2")] INavigator navigator,
    IWeightsManager weights) =>
{
    var start = new LatLng(request.Start.Lat, request.Start.Lng);
    var end = new LatLng(request.End.Lat, request.End.Lng);
    var config = weights.GetConfig();

    var result = await navigator.ComputeRouteAsync(start, end, config);
    return Results.Ok(result);
});

app.MapPost("/navigate/v2/simulate", async (
    SimulationRequest request,
    [FromKeyedServices("navigator_v2")] INavigator navigator,
    IWeightsManager weights) =>
{
    var start = new LatLng(request.Start.Lat, request.Start.Lng);
    var end = new LatLng(request.End.Lat, request.End.Lng);
    var config = weights.GetConfig().WithOverrides(request.Overrides);

    var result = await navigator.ComputeRouteAsync(start, end, config);
    return Results.Ok(result);
});

app.MapPost("/navigate/v2.5", async (
    NavigationRequest request, 
    [FromKeyedServices("navigator_v2MarkII")] INavigator navigator,
    IWeightsManager weights) =>
{
    var start = new LatLng(request.Start.Lat, request.Start.Lng);
    var end = new LatLng(request.End.Lat, request.End.Lng);
    var config = weights.GetConfig();

    var result = await navigator.ComputeRouteAsync(start, end, config);
    return Results.Ok(result);
});

app.MapPost("/navigate/v2.5/simulate", async (
    SimulationRequest request,
    [FromKeyedServices("navigator_v2MarkII")] INavigator navigator,
    IWeightsManager weights) =>
{
    var start = new LatLng(request.Start.Lat, request.Start.Lng);
    var end = new LatLng(request.End.Lat, request.End.Lng);
    var config = weights.GetConfig().WithOverrides(request.Overrides);

    var result = await navigator.ComputeRouteAsync(start, end, config);
    return Results.Ok(result);
});

app.MapGet("/weights", (IWeightsManager weights) => Results.Ok(weights.Current));

app.MapPut("/weights", async (AlgorithmWeights body, IWeightsManager weights, ITransitDataCache transitCache) =>
{
    weights.Update(body);
    await transitCache.InvalidateAsync();
    return Results.Ok(new { message = "Weights updated" });
});

// Called by the dashboard when routes/regions/closures are edited
app.MapPost("/cache/invalidate", async (ITransitDataCache transitCache) =>
{
    await transitCache.InvalidateAsync();
    return Results.Ok(new { message = "Transit cache invalidated" });
});

await app.RunAsync();
