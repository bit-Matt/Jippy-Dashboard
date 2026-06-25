// ReSharper disable UnusedAutoPropertyAccessor.Global
// ReSharper disable CollectionNeverUpdated.Global

using System.Text.Json.Serialization;


namespace JippyServices.Algorithm.Api.Responses;

internal sealed class OSRMRouteResponse
{
    [JsonPropertyName("code")]
    public string Code { get; init; } = "Ok";
    
    [JsonPropertyName("routes")]
    public List<Route>? Routes { get; init; }
    
    [JsonPropertyName("message")]
    public string? Message { get; init; }
}

internal sealed class Route
{
    [JsonPropertyName("geometry")]
    public string? Geometry { get; init; }

    [JsonPropertyName("distance")]
    public double? Distance { get; init; }

    [JsonPropertyName("duration")]
    public double? Duration { get; init; }
    
    public List<Leg>? Legs { get; init; }
}

internal sealed class Leg
{
    public List<Step>? Steps { get; init; }
}

internal sealed class Step
{
    [JsonPropertyName("distance")]
    public double? Distance { get; init; }

    [JsonPropertyName("duration")]
    public double? Duration { get; init; }

    [JsonPropertyName("name")]
    public string? Name { get; init; }
    
    [JsonPropertyName("maneuver")]
    public Manuever? Maneuver { get; init; }
}

internal sealed class Manuever
{
    [JsonPropertyName("type")]
    public string? Type { get; init; }

    [JsonPropertyName("modifier")]
    public string? Modifier { get; init; }
}
