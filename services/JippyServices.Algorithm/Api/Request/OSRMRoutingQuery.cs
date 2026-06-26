using Refit;

namespace JippyServices.Algorithm.Api.Request;

/// <summary>
/// Query parameters for the OSRM <c>/route/v1</c> endpoint.
/// All boolean-style fields are typed as <see langword="string"/> (not <see langword="bool"/>)
/// because Refit serialises C# <see langword="bool"/> via <c>Convert.ToString</c>, which
/// produces <c>"True"</c>/<c>"False"</c> (capital first letter). OSRM requires lowercase
/// <c>"true"</c>/<c>"false"</c> and returns 400 for any other value.
/// </summary>
internal sealed class OSRMRoutingQuery
{
    [AliasAs("alternatives")]
    public string? Alternatives { get; init; }

    [AliasAs("steps")]
    public string? Steps { get; init; }

    [AliasAs("annotations")]
    public string? Annotations { get; init; }

    [AliasAs("geometries")]
    public string? Geometries { get; init; }

    [AliasAs("overview")]
    public string? Overview { get; init; }

    [AliasAs("continue_straight")]
    public string? ContinueStraight { get; init; }
}
