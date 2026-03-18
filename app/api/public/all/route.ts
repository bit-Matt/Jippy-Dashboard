import * as closure from "@/lib/management/closure-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import * as region from "@/lib/management/region-manager";
import * as route from "@/lib/management/route-manager";
import { unwrap } from "@/lib/one-of";

export async function GET() {
  try {
    const [allRoutes, allRegions, allClosures] = await Promise.all([
      unwrap(route.getAllRoutes()),
      unwrap(region.getAllRegions()),
      unwrap(closure.getAllClosures()),
    ]);

    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({
        routes: allRoutes,
        regions: allRegions,
        closures: allClosures,
      })
      .orchestrate();
  } catch {
    return ResponseComposer.composeError(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}
