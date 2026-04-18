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

// HTTP clients for external routing services
builder.Services.AddHttpClient<GraphHopperClient>();
builder.Services.AddHttpClient<ValhallaClient>();
builder.Services.AddHttpClient<NominatimClient>();

// Navigator services
builder.Services.AddSingleton<TransitDataCache>();
builder.Services.AddScoped<GraphBuilder>();
builder.Services.AddScoped<InstructionGenerator>();
builder.Services.AddScoped<LegAssembler>();
builder.Services.AddScoped<NavigationService>();

var app = builder.Build();

app.MapPost("/navigate", async (NavigationRequest request, NavigationService nav) =>
{
    var start = new LatLng(request.Start.Lat, request.Start.Lng);
    var end = new LatLng(request.End.Lat, request.End.Lng);

    var result = await nav.ComputeRouteAsync(start, end);
    return Results.Ok(result);
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

internal sealed class LatLngObject
{
    [JsonPropertyName("lat")]
    public double Lat { get; init; }

    [JsonPropertyName("lng")]
    public double Lng { get; init; }
}
