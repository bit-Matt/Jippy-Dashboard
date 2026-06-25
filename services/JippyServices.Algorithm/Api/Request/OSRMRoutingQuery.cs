using Refit;

namespace JippyServices.Algorithm.Api.Request;

internal sealed class OSRMRoutingQuery
{
    [AliasAs("alternatives")]
    public bool? Alternatives { get; init; }
    
    [AliasAs("steps")]
    public bool? Steps { get; init; }
    
    [AliasAs("annotations")]
    public bool? Annotations { get; init; }
    
    [AliasAs("geometries")]
    public string? Geometries { get; init; }
    
    [AliasAs("overview")]
    public string? Overview { get; init; }
    
    [AliasAs("continue_straight")]
    public bool? ContinueStraight { get; init; }
}
