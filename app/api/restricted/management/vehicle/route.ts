import type { NextRequest } from "next/server";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validator";
import * as vehicle from "@/lib/management/vehicle-manager";
import { logActivity } from "@/lib/management/activity-logger";

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const result = await vehicle.getAllVehicleTypes();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(request: NextRequest) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const data = await tryParseJson<RequestBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
      requiresRoute: { type: "boolean" },
    },
    requiredProperties: ["name", "requiresRoute"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await vehicle.createVehicleType({
    name: data.name,
    requiresRoute: data.requiresRoute,
  }, currentSession.user!.id);

  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "vehicle_type_created",
        summary: `Created vehicle type ${s.name}`,
        routePath: "/api/restricted/management/vehicle",
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        entityType: "vehicle_type",
        entityId: s.id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RequestBody = {
  name: string;
  requiresRoute: boolean;
};
