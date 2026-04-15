import type { NextRequest } from "next/server";

import * as closure from "@/lib/management/closure-manager";
import { oneOf } from "@/lib/one-of";
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
    routePath: "/dashboard/closure",
    summary: "Visited closure dashboard",
  });

  try {
    const allClosures = await unwrap(closure.getAllClosures(false));

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(allClosures)
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
      shape: { type: "string", formatter: "non-empty-string" },
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
    requiredProperties: ["closureName", "closureDescription", "points", "shape", "closureType"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  // Cross-field: scheduled closures require a valid endDate.
  if (data.closureType === "scheduled") {
    const parsedEnd = data.endDate ? new Date(data.endDate) : null;
    if (!parsedEnd || isNaN(parsedEnd.getTime())) {
      return ApiResponseBuilder
        .createError(StatusCodes.Status400BadRequest, [{ message: "endDate is required and must be a valid date for scheduled closures." }])
        .build();
    }
  }

  const result = await closure.createClosure({
    closureName: data.closureName,
    closureDescription: data.closureDescription,
    shape: data.shape,
    points: data.points,
    closureType: data.closureType,
    endDate: data.closureType === "scheduled" ? new Date(data.endDate!) : null,
  }, currentSession.user!.id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "closure_created",
        summary: `Created closure ${s.closureName}`,
        routePath: "/api/restricted/management/closure",
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        entityType: "closure",
        entityId: s.id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RequestBody = {
  closureName: string;
  closureDescription: string;
  points: Array<{
    sequence: number;
    point: [number, number];
  }>;
  shape: string;
  closureType: "indefinite" | "scheduled";
  endDate?: string;
}
