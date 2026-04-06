import type { NextRequest } from "next/server";

import { oneOf } from "@/lib/one-of";
import * as region from "@/lib/management/region-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { unwrap } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { logActivity, logDashboardVisit } from "@/lib/management/activity-logger";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidStationTimeRange = (availableFrom?: string, availableTo?: string) => {
  const from = availableFrom ?? "00:00";
  const to = availableTo ?? "23:59";

  if (!TIME_PATTERN.test(from) || !TIME_PATTERN.test(to)) {
    return false;
  }

  return from <= to;
};

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  void logDashboardVisit({
    actorUserId: currentSession.user!.id,
    actorRole: currentSession.user!.role,
    routePath: "/dashboard/region",
    summary: "Visited region dashboard",
  });

  try {
    const result = await unwrap(region.getAllRegions(false));
    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(result)
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
            return { ok: false, error: "Invalid points." };
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

            if (!isValidStationTimeRange(point.availableFrom, point.availableTo)) {
              return { ok: false, error: "Invalid station availability range. Use HH:mm and ensure from <= to." };
            }

            if (!utils.isExisty(point.point) || !utils.isTuple(point.point)) {
              return { ok: false, error: "Invalid point." };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["snapshotName", "regionName", "regionColor", "regionShape", "points", "stations"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  if (data.snapshotState === "ready" && currentSession.user?.role !== "administrator_user") {
    return ResponseComposer.composeError(StatusCodes.Status403Forbidden, [{ message: "Insufficient permissions to set ready state." }])
      .orchestrate();
  }

  const result = await region.createRegion(data, currentSession.user!.id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "region_created",
        summary: `Created region ${s.regionName}`,
        routePath: "/api/restricted/management/region",
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        entityType: "region",
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
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<{
    sequence: number;
    point: [number, number];
  }>;
  stations: Array<{
    address: string;
    availableFrom?: string;
    availableTo?: string;
    point: [number, number];
  }>;
}
