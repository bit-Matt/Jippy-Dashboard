import type { NextRequest } from "next/server";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { utils, validator } from "@/lib/validator";
import * as vehicle from "@/lib/management/vehicle-manager";
import { logActivity } from "@/lib/management/activity-logger";

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/vehicle/[id]">,
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Vehicle type not found." }])
      .build();
  }

  const data = await tryParseJson<RequestBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const hasAnyField = data.name !== undefined || data.requiresRoute !== undefined;
  if (!hasAnyField) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .build();
  }

  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
      requiresRoute: { type: "boolean" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await vehicle.updateVehicleType(id, {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.requiresRoute !== undefined && { requiresRoute: data.requiresRoute }),
  });

  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "vehicle_type_updated",
        summary: `Updated vehicle type ${s.name}`,
        routePath: `/api/restricted/management/vehicle/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "vehicle_type",
        entityId: s.id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/vehicle/[id]">,
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Vehicle type not found." }])
      .build();
  }

  const result = await vehicle.deleteVehicleType(id);
  return oneOf(result).match(
    () => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "vehicle_type_deleted",
        summary: `Deleted vehicle type ${id}`,
        routePath: `/api/restricted/management/vehicle/${id}`,
        httpMethod: "DELETE",
        statusCode: StatusCodes.Status200Ok,
        entityType: "vehicle_type",
        entityId: id,
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody({ ok: true })
        .build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RequestBody = {
  name?: string;
  requiresRoute?: boolean;
};
