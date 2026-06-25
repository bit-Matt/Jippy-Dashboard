using Refit;

namespace JippyServices.Algorithm.Api.Request;

internal sealed class NominatimReverseQuery
{
    [AliasAs("format")]
    public required string Format { get; init; } = "jsonv2";
    
    [AliasAs("lat")]
    public required double Latitude { get; init; }
    
    [AliasAs("lon")]
    public required double Longitude { get; init; }
    
    [AliasAs("addressdetails")]
    public Toggleable? AddressDetails { get; init; }
    
    [AliasAs("extratags")]
    public Toggleable? ExtraTags { get; init; }
    
    [AliasAs("namedetails")]
    public Toggleable? NameDetails { get; init; }
    
    [AliasAs("entrances")]
    public Toggleable? Entrances { get; init; }
    
    [AliasAs("zoom")]
    public int Zoom { get; init; } = 18;
    
    /// <summary>
    /// comma-separated list of: address, poi, railway, natural, manmade
    /// </summary>
    [AliasAs("layer")]
    public string? Layer { get; init; }
    
    [AliasAs("polygon_geojson")]
    public Toggleable? PolygonGeoJson { get; init; }
    
    [AliasAs("polygon_kml")]
    public Toggleable? PolygonKml { get; init; }
    
    [AliasAs("polygon_svg")]
    public Toggleable? PolygonSvg { get; init; }
    
    [AliasAs("polygon_text")]
    public Toggleable? PolygonText { get; init; }
    
    [AliasAs("polygon_threshold")]
    public float? PolygonThreshold { get; init; }
    
    [AliasAs("email")]
    public string? Email { get; init; }
    
    [AliasAs("debug")]
    public Toggleable? Debug { get; init; }
}

internal enum Toggleable
{
    On = 1,
    Off = 0,
}
