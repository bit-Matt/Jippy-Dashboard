import type { NextRequest } from "next/server";

import * as closure from "@/lib/management/closure-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";
import { logActivity } from "@/lib/management/activity-logger";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid snapshot ID" }])
      .orchestrate();
  }

  const result = await closure.getClosureById(id, snapshotId);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid snapshot ID" }])
      .orchestrate();
  }

  const result = await closure.copySnapshot(id, snapshotId);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "closure_snapshot_copied",
        summary: `Copied closure snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/closure/${id}/${snapshotId}`,
        httpMethod: "PUT",
        statusCode: StatusCodes.Status200Ok,
        entityType: "closure_snapshot",
        entityId: s.id,
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid snapshot ID" }])
      .orchestrate();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid payload." }])
      .orchestrate();
  }

  const hasAnyPatchField =
    data.versionName !== undefined
    || data.snapshotState !== undefined
    || data.shape !== undefined
    || data.closureName !== undefined
    || data.closureDescription !== undefined
    || data.points !== undefined;
  if (!hasAnyPatchField) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .orchestrate();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
    properties: {
      versionName: { type: "string", formatter: "non-empty-string" },
      snapshotState: {
        type: "string",
        formatterFn: async (value) => {
          if (value === undefined) return { ok: true };
          if (["wip", "for_approval", "ready"].includes(value)) return { ok: true };
          return { ok: false, error: "Invalid snapshot state." };
        },
      },
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

  if (data.snapshotState === "ready" && currentSession.user?.role !== "administrator_user") {
    return ResponseComposer.composeError(StatusCodes.Status403Forbidden, [{ message: "Insufficient permissions to set ready state." }])
      .orchestrate();
  }

  const result = await closure.updateClosure(id, snapshotId, data);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: data.snapshotState !== undefined ? "snapshot_state_changed" : "write_operation",
        action: data.snapshotState !== undefined ? "closure_snapshot_state_changed" : "closure_snapshot_updated",
        summary: `Updated closure snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/closure/${id}/${snapshotId}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "closure_snapshot",
        entityId: snapshotId,
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
  { params }: RouteContext<"/api/restricted/management/closure/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No closures found." }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such snapshot found." }])
      .orchestrate();
  }

  const result = await closure.deleteSnapshot(id, snapshotId);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "closure_snapshot_deleted",
        summary: `Deleted closure snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/closure/${id}/${snapshotId}`,
        httpMethod: "DELETE",
        statusCode: StatusCodes.Status200Ok,
        entityType: "closure_snapshot",
        entityId: snapshotId,
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody(success)
        .orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type PatchRequestBody = {
  versionName?: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  shape?: string;
  closureName?: string;
  closureDescription?: string;
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
}
