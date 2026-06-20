import type { NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { logActivity } from "@/lib/management/activity-logger";
import * as dataManager from "@/lib/management/data-manager";
import { ImportPayloadSchema } from "@/lib/management/data-schema";
import { invalidate } from "@/lib/routing-fast";
import { oneOf } from "@/lib/one-of";

export async function POST(request: NextRequest) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const body = await tryParseJson<unknown>(request);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid JSON payload." }])
      .build();
  }

  const validation = ImportPayloadSchema.safeParse(body);
  if (!validation.success) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.error.issues.map(issue => ({
        message: `${issue.path.join(".")}: ${issue.message}`,
      })),
    ).build();
  }

  const result = await dataManager.importData(validation.data, currentSession.user!.id);

  return oneOf(result).match(
    (summary) => {
      void invalidate();
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "data_imported",
        summary: `Imported ${summary.routes} routes, ${summary.regions} regions, ${summary.closures} closures, ${summary.stops} stops, ${summary.restrictedBoardingZones} restricted boarding zones`,
        routePath: "/api/restricted/management/data/import",
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        payload: summary,
      });

      return ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(summary).build();
    },
    (error) => ApiResponseBuilder.createFromFailure(error).build(),
  );
}
