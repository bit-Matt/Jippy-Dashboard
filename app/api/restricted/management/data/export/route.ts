import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { logActivity } from "@/lib/management/activity-logger";
import * as dataManager from "@/lib/management/data-manager";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const result = await dataManager.exportAllData();
  return oneOf(result).match(
    (payload) => {
      const filename = `jippy-export-${new Date().toISOString().slice(0, 10)}.json`;
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "data_exported",
        summary: `Exported ${payload.routes.length} routes, ${payload.regions.length} regions, ${payload.closures.length} closures, ${payload.stops.length} stops, ${payload.vehicleTypes.length} vehicle types`,
        routePath: "/api/restricted/management/data/export",
        httpMethod: "GET",
        statusCode: StatusCodes.Status200Ok,
        payload: {
          version: payload.version,
          exportedAt: payload.exportedAt,
          counts: {
            routes: payload.routes.length,
            regions: payload.regions.length,
            closures: payload.closures.length,
            stops: payload.stops.length,
            vehicleTypes: payload.vehicleTypes.length,
          },
        },
      });
      return new Response(JSON.stringify(payload, null, 2), {
        status: StatusCodes.Status200Ok,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    (error) => ApiResponseBuilder.createFromFailure(error).build(),
  );
}
