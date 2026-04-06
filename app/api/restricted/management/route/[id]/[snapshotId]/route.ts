import type { NextRequest } from "next/server";

import { getRoutePolyline } from "@/lib/osm/valhalla";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import * as route from "@/lib/management/route-manager";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";
import { logActivity } from "@/lib/management/activity-logger";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const validateTimeRange = (availableFrom?: string, availableTo?: string) => {
  if (availableFrom === undefined && availableTo === undefined) {
    return { ok: true as const };
  }

  if (availableFrom === undefined || availableTo === undefined) {
    return { ok: false as const, error: "Both availableFrom and availableTo are required when updating route availability." };
  }

  const from = availableFrom;
  const to = availableTo;

  if (!TIME_PATTERN.test(from)) {
    return { ok: false as const, error: "Invalid availableFrom time. Use HH:mm format." };
  }

  if (!TIME_PATTERN.test(to)) {
    return { ok: false as const, error: "Invalid availableTo time. Use HH:mm format." };
  }

  if (from > to) {
    return { ok: false as const, error: "availableFrom must be earlier than or equal to availableTo." };
  }

  return { ok: true as const };
};

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/[snapshotId]">,
) {
  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No route found with the given ID." }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No snapshot found with the given ID." }])
      .orchestrate();
  }

  const result = await route.getRouteById(id, snapshotId);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such route found." }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such snapshot found." }])
      .orchestrate();
  }

  const result = await route.copySnapshot(id, snapshotId, currentSession.user!.id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "route_snapshot_copied",
        summary: `Copied route snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/route/${id}/${snapshotId}`,
        httpMethod: "PUT",
        statusCode: StatusCodes.Status200Ok,
        entityType: "route_snapshot",
        entityId: s.id,
        metadata: { sourceSnapshotId: snapshotId },
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/[snapshotId]">,
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
    || data.routeNumber !== undefined
    || data.routeName !== undefined
    || data.routeColor !== undefined
    || data.routeDetails !== undefined
    || data.availableFrom !== undefined
    || data.availableTo !== undefined
    || data.points !== undefined;
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
      routeNumber: { type: "string", formatter: "non-empty-string" },
      routeName: { type: "string", formatter: "non-empty-string" },
      routeColor: { type: "string", formatter: "hex-color" },
      routeDetails: { type: "string", formatter: "non-empty-string" },
      availableFrom: { type: "string", formatterFn: async (value) => {
        if (value === undefined) return { ok: true };
        if (!TIME_PATTERN.test(value)) return { ok: false, error: "Invalid availableFrom time. Use HH:mm format." };
        return { ok: true };
      } },
      availableTo: { type: "string", formatterFn: async (value) => {
        if (value === undefined) return { ok: true };
        if (!TIME_PATTERN.test(value)) return { ok: false, error: "Invalid availableTo time. Use HH:mm format." };
        return { ok: true };
      } },
      points: {
        type: "object",
        formatterFn: async (values) => {
          // Pass if not defined.
          if (!values) return { ok: true };

          if (!Array.isArray(values.goingTo) || !Array.isArray(values.goingBack)) {
            return { ok: false, error: "Invalid points." };
          }

          if (values.goingTo.length < 2 || values.goingBack.length < 2) {
            return { ok: false, error: "Some of your points does not meet the >=2 point criteria." };
          }

          for (const point of [...values.goingTo, ...values.goingBack]) {
            if (!utils.isExisty(point.sequence) || !utils.isFinite(point.sequence)) {
              return { ok: false, error: "Invalid sequence." };
            }

            if (!utils.isExisty(point.address) || !utils.isNonEmpty(point.address)) {
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

  const timeRangeValidation = validateTimeRange(data.availableFrom, data.availableTo);
  if (!timeRangeValidation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: timeRangeValidation.error }])
      .orchestrate();
  }

  if (data.snapshotState === "ready" && currentSession.user?.role !== "administrator_user") {
    return ResponseComposer.composeError(StatusCodes.Status403Forbidden, [{ message: "Insufficient permissions to set ready state." }])
      .orchestrate();
  }

  const patchPayload: route.UpdateRouteParameters = { ...data };

  if (data.points) {
    const [polylineGoingTo, polylineGoingBack] = await Promise.all([
      getRoutePolyline(data.points.goingTo),
      getRoutePolyline(data.points.goingBack),
    ]);

    patchPayload.polylineGoingTo = polylineGoingTo;
    patchPayload.polylineGoingBack = polylineGoingBack;
  }

  const result = await route.updateRouteSnapshot(id, snapshotId, patchPayload);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: data.snapshotState !== undefined ? "snapshot_state_changed" : "write_operation",
        action: data.snapshotState !== undefined ? "route_snapshot_state_changed" : "route_snapshot_updated",
        summary: `Updated route snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/route/${id}/${snapshotId}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "route_snapshot",
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
  { params }: RouteContext<"/api/restricted/management/route/[id]/[snapshotId]">,
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

  const result = await route.deleteSnapshot(id, snapshotId);
  return oneOf(result).match(
    success => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "route_snapshot_deleted",
        summary: `Deleted route snapshot ${snapshotId}`,
        routePath: `/api/restricted/management/route/${id}/${snapshotId}`,
        httpMethod: "DELETE",
        statusCode: StatusCodes.Status200Ok,
        entityType: "route_snapshot",
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
  routeNumber?: string;
  routeName?: string;
  routeColor?: string;
  routeDetails?: string;
  availableFrom?: string;
  availableTo?: string;
  points?: {
    goingTo: Array<{
      sequence: number;
      address: string;
      point: [number, number];
    }>;
    goingBack: Array<{
      sequence: number;
      address: string;
      point: [number, number];
    }>;
  }
}
