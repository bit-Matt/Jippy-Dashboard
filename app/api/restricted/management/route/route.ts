import type { NextRequest } from "next/server";

import { getRoutePolyline } from "@/lib/osm/valhalla";
import { oneOf, unwrap } from "@/lib/one-of";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import * as closure from "@/lib/management/closure-manager";
import * as route from "@/lib/management/route-manager";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";
import { logActivity, logDashboardVisit } from "@/lib/management/activity-logger";

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  void logDashboardVisit({
    actorUserId: currentSession.user!.id,
    actorRole: currentSession.user!.role,
    routePath: "/dashboard/route",
    summary: "Visited route dashboard",
  });

  try {
    const [allRoutes, allClosures] = await Promise.all([
      unwrap(route.getAllRoutes(false)),
      unwrap(closure.getAllClosures(true)),
    ]);

    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({
        routes: allRoutes,
        closures: allClosures,
      })
      .orchestrate();
  } catch {
    return ResponseComposer.composeError(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}

export async function POST(req: NextRequest) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const data = await tryParseJson<RequestBody>(req);

  // Body is unparseable.
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
      availableFrom: { type: "string", formatter: "time-hh-mm" },
      availableTo: { type: "string", formatter: "time-hh-mm" },
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

  const timeRangeValidation = utils.isValidTimeRange(data.availableFrom, data.availableTo);
  if (!timeRangeValidation) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid time range" }])
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

  const result = await route.addRoute({
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
        action: "route_created",
        summary: `Created route ${s.routeNumber} - ${s.routeName}`,
        routePath: "/api/restricted/management/route",
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        entityType: "route",
        entityId: s.id,
        payload: data,
      });

      return ResponseComposer.compose(StatusCodes.Status201Created).setBody(s).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type RequestBody = {
  snapshotName: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  routeNumber: string;
  routeName: string;
  routeColor: string;
  routeDetails: string;
  vehicleTypeId: string;
  availableFrom?: string;
  availableTo?: string;
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
