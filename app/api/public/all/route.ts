import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";

export async function GET() {
  try {
    const [allRoutes, allRegions, allClosures] = await Promise.all([
      management.getAllRoutes(),
      management.getAllRegions(),
      management.getAllClosures(),
    ]);

    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({
        routes: allRoutes,
        regions: allRegions,
        // NOTE: Road closures are walkable segments/areas but not drivable by vehicles.
        // Line closures include a direction field indicating one-way vs both-ways closure.
        // Region closures mean all roads inside the region are closed in both directions for vehicles.
        closures: allClosures,
      })
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}
