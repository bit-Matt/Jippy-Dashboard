import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { cacheManager } from "@/lib/cache";
import * as closure from "@/lib/management/closure-manager";
import * as region from "@/lib/management/region-manager";
import * as route from "@/lib/management/route-manager";
import * as stops from "@/lib/management/stop-manager";
import { unwrap } from "@/lib/one-of";
import {RedisJSON} from "redis";

export async function GET() {
  try {
    const key = "all-data-cache";
    const cached = await cacheManager.getJson<AllData>(key);
    if (cached) {
      const collator = new Intl.Collator("en", { numeric: true });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody({
          routes: cached.routes.sort((a, b) => {
            return collator.compare(a.routeNumber, b.routeNumber);
          }),
          regions: cached.regions,
          closure: cached.closure,
          stops: cached.stops,
        })
        .build();
    }

    const [allRoutes, allRegions, allClosures, allStops] = await Promise.all([
      unwrap(route.getAllRoutes(true)),
      unwrap(region.getAllRegions(true)),
      unwrap(closure.getAllClosures(true)),
      unwrap(stops.getAllStops(true)),
    ]);

    const response = {
      routes: allRoutes as route.RouteBaseObject[],
      regions: allRegions as region.RegionBaseObject[],
      closure: allClosures,
      stops: allStops,
    } satisfies AllData;

    await cacheManager.writeJson(
      key,
      response as unknown as Record<string, RedisJSON>,
      { lifetime: (5 + (2 * Math.random())) / 60 },
    );

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(response)
      .build();
  } catch {
    return ApiResponseBuilder.createError(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).build();
  }
}

type AllData = {
  routes: route.RouteBaseObject[]
  regions: region.RegionBaseObject[]
  closure: closure.ClosureBaseObject[]
  stops: stops.BaseStopObject[]
}
