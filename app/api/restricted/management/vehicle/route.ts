import type { NextRequest } from "next/server";

import { ResponseComposer, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validator";
import * as vehicle from "@/lib/management/vehicle-manager";
import { logActivity } from "@/lib/management/activity-logger";

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const result = await vehicle.getAllVehicleTypes();
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function POST(request: NextRequest) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const data = await tryParseJson<RequestBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
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
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
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

      return ResponseComposer.compose(StatusCodes.Status201Created).setBody(s).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type RequestBody = {
  name: string;
  requiresRoute: boolean;
};
