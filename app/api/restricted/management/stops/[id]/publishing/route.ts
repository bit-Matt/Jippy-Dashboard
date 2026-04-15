import type { NextRequest } from "next/server";

import * as stop from "@/lib/management/stop-manager";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";
import { logActivity } from "@/lib/management/activity-logger";

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/stops/[id]/publishing">,
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No stop found with given ID." }])
      .build();
  }

  const data = await tryParseJson<SwitchPatchBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const validation = await validator.validate<SwitchPatchBody>(data, {
    properties: {
      isPublic: { type: "boolean" },
    },
    requiredProperties: ["isPublic"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await stop.toggleStopPublic(id, data.isPublic);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "publish_state_changed",
        action: "stop_publish_state_changed",
        summary: `Switch publication status for stop ID: ${id}`,
        routePath: `/api/restricted/management/stops/${id}/publishing`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "stop",
        entityId: id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type SwitchPatchBody = {
  isPublic: boolean;
}
