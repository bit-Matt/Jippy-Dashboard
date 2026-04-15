import type { NextRequest } from "next/server";

import * as stop from "@/lib/management/stop-manager";
import { oneOf } from "@/lib/one-of";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { unwrap } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { logActivity, logDashboardVisit } from "@/lib/management/activity-logger";

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  void logDashboardVisit({
    actorUserId: currentSession.user!.id,
    actorRole: currentSession.user!.role,
    routePath: "/dashboard/stops",
    summary: "Visited stops dashboard",
  });

  try {
    const allStops = await unwrap(stop.getAllStops(false));

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(allStops)
      .build();
  } catch {
    return ApiResponseBuilder.createError(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).build();
  }
}

export async function POST(req: NextRequest) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const data = await tryParseJson<RequestBody>(req);

  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
      restrictionType: {
        type: "string",
        formatterFn: async (value) => {
          if (value !== "universal" && value !== "specific") {
            return { ok: false, error: "restrictionType must be 'universal' or 'specific'." };
          }
          return { ok: true };
        },
      },
      points: {
        type: "object",
        formatterFn: async (values) => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "Invalid points." };
          }

          if (values.length < 2) {
            return { ok: false, error: "At least 2 points are required." };
          }

          for (const point of values) {
            if (!utils.isExisty(point.sequence) || !utils.isFinite(point.sequence)) {
              return { ok: false, error: "Invalid sequence." };
            }

            if (!utils.isExisty(point.point) || !utils.isTuple(point.point)) {
              return { ok: false, error: "Invalid point." };
            }
          }

          return { ok: true };
        },
      },
      routeIds: {
        type: "object",
        formatterFn: async (values) => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "routeIds must be an array." };
          }

          for (const id of values) {
            if (!utils.isUuid(id)) {
              return { ok: false, error: "Invalid route ID." };
            }
          }

          return { ok: true };
        },
      },
      vehicleTypeIds: {
        type: "object",
        formatterFn: async (values) => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "vehicleTypeIds must be an array." };
          }

          for (const id of values) {
            if (!utils.isUuid(id)) {
              return { ok: false, error: "Invalid vehicle type ID." };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["name", "restrictionType", "points"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  // Business rule: if SPECIFIC, must have at least one routeId or vehicleTypeId
  if (data.restrictionType === "specific") {
    const hasRoutes = Array.isArray(data.routeIds) && data.routeIds.length > 0;
    const hasVehicleTypes = Array.isArray(data.vehicleTypeIds) && data.vehicleTypeIds.length > 0;

    if (!hasRoutes && !hasVehicleTypes) {
      return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{
        message: "When restrictionType is 'specific', at least one routeId or vehicleTypeId must be provided.",
      }]).build();
    }
  }

  const result = await stop.createStop(data, currentSession.user!.id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "stop_created",
        summary: `Created stop ${s.name}`,
        routePath: "/api/restricted/management/stops",
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        entityType: "stop",
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
  restrictionType: "universal" | "specific";
  points: Array<{
    sequence: number;
    point: [number, number];
  }>;
  routeIds?: string[];
  vehicleTypeIds?: string[];
}
