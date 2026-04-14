import type { NextRequest } from "next/server";

import { oneOf } from "@/lib/one-of";
import * as region from "@/lib/management/region-manager";
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
    routePath: "/dashboard/region",
    summary: "Visited region dashboard",
  });

  try {
    const result = await unwrap(region.getAllRegions(false));
    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(result)
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

  // Body is unparseable.
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
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

            if (!utils.isValidTimeRange(point.availableFrom, point.availableTo)) {
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
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  if (data.snapshotState === "ready" && currentSession.user?.role !== "administrator_user") {
    return ApiResponseBuilder.createError(StatusCodes.Status403Forbidden, [{ message: "Insufficient permissions to set ready state." }])
      .build();
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

      return ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
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
