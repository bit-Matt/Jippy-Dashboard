import type { NextRequest } from "next/server";

import * as closure from "@/lib/management/closure-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
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
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No closure found with given ID." }])
      .orchestrate();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
  }

  // Validate the body first.
  const hasAnyPatchField = data.shape !== undefined
    || data.closureName !== undefined
    || data.closureDescription !== undefined
    || data.points !== undefined;
  if (!hasAnyPatchField) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .orchestrate();
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
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  const result = await closure.updateClosure(id, data);
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

      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody(success)
        .orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  try {
    const isDeletable = await unwrap(closure.isClosureDeletableByContributor(id));

    // Content is not deletable
    if (!isDeletable && currentSession.user!.role !== "administrator_user") {
      return ResponseComposer.composeError(StatusCodes.Status403Forbidden, { message: "Insufficient Permissions" })
        .orchestrate();
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

        return ResponseComposer.compose(StatusCodes.Status200Ok)
          .setBody({ ok: true })
          .orchestrate();
      },
      e => ResponseComposer.composeFromFailure(e).orchestrate(),
    );
  } catch (e) {
    const err = e as unknown as UnwrappedException;
    return ResponseComposer
      .composeError(StatusCodes.Status500InternalServerError, { message: err.message })
      .orchestrate();
  }
}

type PatchRequestBody = {
  shape?: string;
  closureName?: string;
  closureDescription?: string;
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
}
