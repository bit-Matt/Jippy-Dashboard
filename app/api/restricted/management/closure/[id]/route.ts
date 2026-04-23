import type { NextRequest } from "next/server";

import * as closure from "@/lib/management/closure-manager";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import {oneOf, unwrap, UnwrappedException} from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";
import { logActivity } from "@/lib/management/activity-logger";

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]">,
) {
  const currentSession = await session.verify();
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

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  // Validate the body first.
  const hasAnyPatchField = data.shape !== undefined
    || data.closureName !== undefined
    || data.closureDescription !== undefined
    || data.points !== undefined
    || data.closureType !== undefined
    || data.endDate !== undefined;
  if (!hasAnyPatchField) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .build();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
    properties: {
      shape: { type: "string", formatter: "non-empty-string" },
      closureName: { type: "string", formatter: "non-empty-string" },
      closureDescription: { type: "string", formatter: "non-empty-string" },
      points: {
        type: "object",
        formatterFn: async (values) => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "Invalid points." };
          }

          if (values.length < 3) {
            return { ok: false, error: "At least 3 points are required." };
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
      closureType: {
        type: "string",
        formatterFn: async (value) => {
          if (value !== "indefinite" && value !== "scheduled") {
            return { ok: false, error: "closureType must be 'indefinite' or 'scheduled'." };
          }
          return { ok: true };
        },
      },
      endDate: { type: "string" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [validation.errors!])
      .build();
  }

  // Cross-field: if switching to scheduled, a valid endDate is required.
  if (data.closureType === "scheduled") {
    const parsedEnd = data.endDate ? new Date(data.endDate) : null;
    if (!parsedEnd || isNaN(parsedEnd.getTime())) {
      return ApiResponseBuilder
        .createError(StatusCodes.Status400BadRequest, [{ message: "endDate is required and must be a valid date for scheduled closures." }])
        .build();
    }
  }

  const updateParams: Parameters<typeof closure.updateClosure>[1] = {
    ...(data.closureName !== undefined && { closureName: data.closureName }),
    ...(data.closureDescription !== undefined && { closureDescription: data.closureDescription }),
    ...(data.shape !== undefined && { shape: data.shape }),
    ...(data.points !== undefined && { points: data.points }),
    ...(data.closureType !== undefined && { closureType: data.closureType }),
    ...(data.closureType === "indefinite" && { endDate: null }),
    ...(data.closureType === "scheduled" && { endDate: new Date(data.endDate!) }),
  };

  const result = await closure.updateClosure(id, updateParams);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "closure_entry_updated",
        summary: `Updated closure ${id}`,
        routePath: `/api/restricted/management/closure/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "closure",
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
  { params }: RouteContext<"/api/restricted/management/closure/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Invalid closure ID" }])
      .build();
  }

  try {
    const isDeletable = await unwrap(closure.isClosureDeletableByContributor(id));

    // Content is not deletable
    if (!isDeletable && currentSession.user!.role !== "administrator_user") {
      return ApiResponseBuilder.createError(StatusCodes.Status403Forbidden, { message: "Insufficient Permissions" })
        .build();
    }

    // Delete the closure
    const result = await closure.removeClosure(id);
    return oneOf(result).match(
      () => {
        void logActivity({
          actorUserId: currentSession.user!.id,
          actorRole: currentSession.user!.role,
          category: "write_operation",
          action: "closure_deleted",
          summary: `Deleted closure ${id}`,
          routePath: `/api/restricted/management/closure/${id}`,
          httpMethod: "DELETE",
          statusCode: StatusCodes.Status200Ok,
          entityType: "closure",
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
  shape?: string;
  closureName?: string;
  closureDescription?: string;
  closureType?: "indefinite" | "scheduled";
  endDate?: string;
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
}
