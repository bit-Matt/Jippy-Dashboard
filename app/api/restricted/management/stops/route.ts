import type { NextRequest } from "next/server";

import * as stop from "@/lib/management/stop-manager";
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
    routePath: "/dashboard/stops",
    summary: "Visited stops dashboard",
  });

  try {
    const allStops = await unwrap(stop.getAllStops(false));

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(allStops)
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

  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      number: { type: "number", formatter: "positive-integer" },
      point: {
        type: "object",
        formatterFn: async (value) => {
          if (!utils.isTuple(value)) {
            return { ok: false, error: "Invalid point." };
          }
          return { ok: true };
        },
      },
      directionality: {
        type: "string",
        formatterFn: async (value) => {
          if (value === undefined) {
            return { ok: true };
          }
          if (value !== "direction_to" && value !== "direction_back" && value !== "both") {
            return { ok: false, error: "directionality must be 'direction_to', 'direction_back', or 'both'." };
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: ["point"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await stop.createStop(data, currentSession.user!.id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "transit_stop_created",
        summary: `Created stop #${s.number}`,
        routePath: "/api/restricted/management/stops",
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        entityType: "stop",
        entityId: s.id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RequestBody = {
  number?: number;
  point: [number, number];
  directionality?: "direction_to" | "direction_back" | "both";
}
