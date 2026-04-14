import type { NextRequest } from "next/server";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as route from "@/lib/management/route-manager";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { logActivity } from "@/lib/management/activity-logger";
import { session, SessionCode } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/snapshots">,
) {
  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No such route ID found" }])
      .build();
  }

  const result = await route.getAllSnapshotByRouteId(id);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]">,
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No closure found with given ID." }])
      .build();
  }

  const data = await tryParseJson<SwitchPatchBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  // Validate the body first.
  const validation = await validator.validate<SwitchPatchBody>(data, {
    properties: {
      snapshotId: { type: "string", formatter: "uuid" },
    },
    requiredProperties: ["snapshotId"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await route.switchSnapshot(id, data.snapshotId);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "active_snapshot_changed",
        action: "route_active_snapshot_changed",
        summary: `Switched active snapshot for route ${id}`,
        routePath: `/api/restricted/management/route/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "route",
        entityId: id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type SwitchPatchBody = {
  snapshotId: string;
}
