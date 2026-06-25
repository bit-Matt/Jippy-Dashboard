using System.Text.Json.Serialization;

namespace JippyServices.Algorithm.Contracts.V2.Requests;

/// <summary>
/// A JSON-deserialisable latitude/longitude pair used in API request bodies.
/// </summary>
internal sealed class LatLngObject
{
    /// <summary>Latitude in decimal degrees (WGS-84).</summary>
    [JsonPropertyName("lat")]
    public double Lat { get; init; }

    /// <summary>Longitude in decimal degrees (WGS-84).</summary>
    [JsonPropertyName("lng")]
    public double Lng { get; init; }
}
