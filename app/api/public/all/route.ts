import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";

export async function GET() {
  try {
    const allRoutes = await management.getAllRoutes();
    const allRegions = await management.getAllRegions();

    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({
        routes: allRoutes,
        regions: allRegions,
      })
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}
