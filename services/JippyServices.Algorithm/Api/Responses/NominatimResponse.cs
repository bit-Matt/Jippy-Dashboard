using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Api.Responses;

internal sealed class NominatimResponse
{
    [JsonPropertyName("place_id")]
    public string PlaceId { get; init; } = "";
    
    [JsonPropertyName("licence")]
    public string Licence { get; init; } = "";
    
    [JsonPropertyName("osm_type")]
    public string OsmType { get; init; } = "";
    
    [JsonPropertyName("osm_id")]
    public string OsmId { get; init; } = "";

    [JsonPropertyName("lat")]
    public string Lat { get; init; } = "";

    [JsonPropertyName("lon")]
    public string Lon { get; init; } = "";

    [JsonPropertyName("place_rank")]
    public string PlaceRank { get; init; } = "";
    
    [JsonPropertyName("category")]
    public string Category { get; init; } = "";
    
    [JsonPropertyName("type")]
    public string Type { get; init; } = "";

    [JsonPropertyName("importance")]
    public string Importance { get; init; } = "";
    
    [JsonPropertyName("addresstype")]
    public string AddressType { get; init; } = "";
    
    [JsonPropertyName("display_name")]
    public string DisplayName { get; init; } = "";
    
    [JsonPropertyName("name")]
    public string Name { get; init; } = "";
    
    [JsonPropertyName("address")]
    public Address Address { get; init; } = new();

    [JsonPropertyName("boundingbox")]
    public List<string> BoundingBox { get; init; } = [];
}

internal sealed class Address
{
    [JsonPropertyName("road")]
    public string? Road { get; init; } = "";
    
    [JsonPropertyName("suburb")]
    public string? Suburb { get; set; }

    [JsonPropertyName("neighbourhood")]
    public string? Neighbourhood { get; set; }
    
    [JsonPropertyName("village")]
    public string? Village { get; init; }
    
    [JsonPropertyName("state_district")]
    public string? StateDistrict { get; init; }
    
    [JsonPropertyName("state")]
    public string? State { get; init; }
    
    [JsonPropertyName("postcode")]
    public string? Postcode { get; init; }
    
    [JsonPropertyName("country")]
    public string Country { get; init; } = "";
    
    [JsonPropertyName("country_code")]
    public string CountryCode { get; init; } = "";
}
