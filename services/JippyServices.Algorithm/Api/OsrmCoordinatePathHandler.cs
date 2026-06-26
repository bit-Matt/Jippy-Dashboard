namespace JippyServices.Algorithm.Api;

/// <summary>
/// Delegating handler that fixes OSRM coordinate path encoding.
/// Refit percent-encodes path parameters via <c>Uri.EscapeDataString</c>, which turns
/// <c>,</c> into <c>%2C</c> and <c>;</c> into <c>%3B</c>. OSRM requires both characters
/// to be literal in the coordinate path segment (e.g. <c>/route/v1/foot/lng1,lat1;lng2,lat2</c>)
/// and returns 400 when they are encoded. This handler decodes them back before the request
/// is dispatched.
/// </summary>
internal sealed class OsrmCoordinatePathHandler : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri is { } uri)
        {
            var raw = uri.AbsoluteUri;
            if (raw.Contains("%2C", StringComparison.Ordinal) || raw.Contains("%3B", StringComparison.Ordinal))
            {
                var fixed_ = raw.Replace("%2C", ",").Replace("%3B", ";");
                request.RequestUri = new Uri(fixed_);
            }
        }

        return base.SendAsync(request, cancellationToken);
    }
}
