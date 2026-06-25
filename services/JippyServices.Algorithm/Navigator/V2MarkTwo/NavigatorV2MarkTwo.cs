using JippyServices.Algorithm.Contracts.V2.Responses;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Weights;

namespace JippyServices.Algorithm.Navigator.V2MarkTwo;

internal sealed class NavigatorV2MarkTwo : INavigator
{
    public Task<MultiNavigateResponse> ComputeRouteAsync(LatLng start, LatLng end, RoutingConfig? config = null)
    {
        throw new NotImplementedException();
    }
}
