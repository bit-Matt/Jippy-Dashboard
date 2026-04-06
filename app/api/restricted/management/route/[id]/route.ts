import type { NextRequest } from "next/server";

import { ResponseComposer, StatusCodes } from "@/lib/http";
import * as route from "@/lib/management/route-manager";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { getRoutePolyline } from "@/lib/osm/valhalla";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";
import { logActivity } from "@/lib/management/activity-logger";

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such route found." }])
      .orchestrate();
  }

  const data = await tryParseJson<RequestBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
  }

  // Validate the body first.
  const validation = await validator.validate<RequestBody>(data, {
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
      vehicleTypeId: { type: "string", formatter: "uuid" },
      points: {
        type: "object",
        formatterFn: async (values) => {
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
    requiredProperties: ["routeNumber", "routeName", "routeColor", "routeDetails", "vehicleTypeId", "points"],
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

  const [polylineGoingTo, polylineGoingBack] = await Promise.all([
    getRoutePolyline(data.points.goingTo),
    getRoutePolyline(data.points.goingBack),
  ]);

  const result = await route.createSnapshot(id, {
    ...data,
    polylineGoingTo,
    polylineGoingBack,
  }, currentSession.user!.id);

  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "route_snapshot_created",
        summary: `Created route snapshot ${s.snapshotName}`,
        routePath: `/api/restricted/management/route/${id}`,
        httpMethod: "POST",
        statusCode: StatusCodes.Status200Ok,
        entityType: "route_snapshot",
        entityId: s.activeSnapshotId,
        payload: data,
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]">,
) {
  const currentSession = await session.verify("administrator_user");
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

  const data = await tryParseJson<SwitchPatchBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
  }

  // Validate the body first.
  const validation = await validator.validate<SwitchPatchBody>(data, {
    properties: {
      snapshotId: { type: "string", formatter: "uuid" },
    },
    requiredProperties: ["snapshotId"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  const result = await route.switchSnapshot(id, data.snapshotId);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "active_snapshot_changed",
        action: "route_active_snapshot_changed",
        summary: `Switched active snapshot for route ${id}`,
        routePath: `/api/restricted/management/route/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "route",
        entityId: id,
        payload: data,
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]">,
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid route ID" }])
      .orchestrate();
  }

  const result = await route.removeRoute(id);
  return oneOf(result).match(
    () => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "route_deleted",
        summary: `Deleted route ${id}`,
        routePath: `/api/restricted/management/route/${id}`,
        httpMethod: "DELETE",
        statusCode: StatusCodes.Status200Ok,
        entityType: "route",
        entityId: id,
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody({ ok: true })
        .orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type SwitchPatchBody = {
  snapshotId: string;
}

type RequestBody = {
  snapshotName: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  routeNumber: string;
  routeName: string;
  routeColor: string;
  routeDetails: string;
  vehicleTypeId: string;
  points: {
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
