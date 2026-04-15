import * as closure from "@/lib/management/closure-manager";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as region from "@/lib/management/region-manager";
import * as route from "@/lib/management/route-manager";
import * as stops from "@/lib/management/stop-manager";
import { unwrap } from "@/lib/one-of";

export async function GET() {
  try {
    const [allRoutes, allRegions, allClosures, allStops] = await Promise.all([
      unwrap(route.getAllRoutes(true)),
      unwrap(region.getAllRegions(true)),
      unwrap(closure.getAllClosures(true)),
      unwrap(stops.getAllStops(true)),
    ]);

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody({
        routes: allRoutes,
        regions: allRegions,
        closure: allClosures,
        stops: allStops,
      })
      .build();
  } catch {
    return ApiResponseBuilder.createError(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).build();
  }
}
