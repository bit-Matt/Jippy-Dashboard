import type { NextRequest } from "next/server";

import * as region from "@/lib/management/region-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { logActivity } from "@/lib/management/activity-logger";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No region found with the given ID." }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No snapshot found with the given ID." }])
      .orchestrate();
  }

  const result = await region.getRegionById(id, snapshotId);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such region found." }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such snapshot found." }])
      .orchestrate();
  }

  const result = await region.copySnapshot(id, snapshotId);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "region_snapshot_copied",
        summary: `Copied region snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/region/${id}/${snapshotId}`,
        httpMethod: "PUT",
        statusCode: StatusCodes.Status200Ok,
        entityType: "region_snapshot",
        entityId: s.id,
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No route found with the given ID." }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No snapshot found with the given ID." }])
      .orchestrate();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid payload." }])
      .orchestrate();
  }

  const hasAnyPatchField =
    data.snapshotName !== undefined
    || data.snapshotState !== undefined
    || data.regionName !== undefined
    || data.regionColor !== undefined
    || data.regionShape !== undefined
    || data.points !== undefined
    || data.stations !== undefined;

  if (!hasAnyPatchField) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .orchestrate();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
    properties: {
      snapshotName: { type: "string", formatter: "non-empty-string" },
      snapshotState: {
        type: "string",
        formatterFn: async (value) => {
          if (value === undefined) return { ok: true };
          if (["wip", "for_approval", "ready"].includes(value)) return { ok: true };
          return { ok: false, error: "Invalid snapshot state." };
        },
      },
      regionName: { type: "string", formatter: "non-empty-string" },
      regionShape: { type: "string", formatter: "non-empty-string" },
      regionColor: { type: "string", formatter: "hex-color" },
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
      stations: {
        type: "object",
        formatterFn: async (values) => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "Invalid points." };
          }

          for (const point of values) {
            if (utils.isExisty(point.address) && !utils.isNonEmpty(point.address)) {
              return { ok: false, error: "Invalid address." };
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

  const result = await region.updateRegionSnapshot(id, snapshotId, data);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: data.snapshotState !== undefined ? "snapshot_state_changed" : "write_operation",
        action: data.snapshotState !== undefined ? "region_snapshot_state_changed" : "region_snapshot_updated",
        summary: `Updated region snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/region/${id}/${snapshotId}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "region_snapshot",
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
  { params }: RouteContext<"/api/restricted/management/region/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No route found with the given ID." }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No snapshot found with the given ID." }])
      .orchestrate();
  }

  const result = await region.deleteSnapshot(id, snapshotId);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "region_snapshot_deleted",
        summary: `Deleted region snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/region/${id}/${snapshotId}`,
        httpMethod: "DELETE",
        statusCode: StatusCodes.Status200Ok,
        entityType: "region_snapshot",
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
  snapshotName?: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  regionName?: string;
  regionColor?: string;
  regionShape?: string;
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
  stations?: Array<{
    address: string;
    point: [number, number];
  }>;
}
