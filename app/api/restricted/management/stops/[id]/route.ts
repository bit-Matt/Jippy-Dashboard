import type { NextRequest } from "next/server";

import * as stop from "@/lib/management/stop-manager";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf, unwrap, UnwrappedException } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";
import { logActivity } from "@/lib/management/activity-logger";

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/stops/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No stop found with given ID." }])
      .build();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const hasAnyPatchField = data.name !== undefined
    || data.points !== undefined
    || data.restrictionType !== undefined
    || data.routeIds !== undefined
    || data.vehicleTypeIds !== undefined;
  if (!hasAnyPatchField) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .build();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
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

          for (const routeId of values) {
            if (!utils.isUuid(routeId)) {
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

          for (const vehicleTypeId of values) {
            if (!utils.isUuid(vehicleTypeId)) {
              return { ok: false, error: "Invalid vehicle type ID." };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [validation.errors!])
      .build();
  }

  const result = await stop.updateStop(id, data);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "stop_entry_updated",
        summary: `Updated stop ${id}`,
        routePath: `/api/restricted/management/stops/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "stop",
        entityId: id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody(success)
        .build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/stops/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Invalid stop ID" }])
      .build();
  }

  try {
    const isModifiable = await unwrap(stop.isStopModifiable(id));

    if (!isModifiable && currentSession.user!.role !== "administrator_user") {
      return ApiResponseBuilder.createError(StatusCodes.Status403Forbidden, { message: "Insufficient Permissions" })
        .build();
    }

    const result = await stop.removeStop(id);
    return oneOf(result).match(
      () => {
        void logActivity({
          actorUserId: currentSession.user!.id,
          actorRole: currentSession.user!.role,
          category: "write_operation",
          action: "stop_deleted",
          summary: `Deleted stop ${id}`,
          routePath: `/api/restricted/management/stops/${id}`,
          httpMethod: "DELETE",
          statusCode: StatusCodes.Status200Ok,
          entityType: "stop",
          entityId: id,
        });

        return ApiResponseBuilder.create(StatusCodes.Status200Ok)
          .withBody({ ok: true })
          .build();
      },
      e => ApiResponseBuilder.createFromFailure(e).build(),
    );
  } catch (e) {
    const err = e as unknown as UnwrappedException;
    return ApiResponseBuilder
      .createError(StatusCodes.Status500InternalServerError, { message: err.message })
      .build();
  }
}

type PatchRequestBody = {
  name?: string;
  restrictionType?: "universal" | "specific";
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
  routeIds?: string[];
  vehicleTypeIds?: string[];
}
