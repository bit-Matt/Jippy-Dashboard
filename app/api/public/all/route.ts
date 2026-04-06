import * as closure from "@/lib/management/closure-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import * as region from "@/lib/management/region-manager";
import * as route from "@/lib/management/route-manager";
import { unwrap } from "@/lib/one-of";

export async function GET() {
  try {
    const [allRoutes, allRegions, allClosures] = await Promise.all([
      unwrap(route.getAllRoutes(true)),
      unwrap(region.getAllRegions(true)),
      unwrap(closure.getAllClosures(true)),
    ]);

    const routes = allRoutes.map(({ activeSnapshotId, snapshotName, snapshotState, vehicleTypeRequiresRoute, ...rest }) => rest);
    const regions = allRegions.map(({ activeSnapshotId, snapshotName, snapshotState, ...rest }) => rest);
    const closures = allClosures.map(({ activeSnapshotId, versionName, snapshotState, ...rest }) => rest);

    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({
        routes,
        regions,
        closures,
      })
      .orchestrate();
  } catch {
    return ResponseComposer.composeError(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}
