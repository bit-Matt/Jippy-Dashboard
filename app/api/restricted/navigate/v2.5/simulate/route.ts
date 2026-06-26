import { type NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder } from "@/lib/http/ApiResponseBuilder";
import * as routingFast from "@/lib/routing-fast";
import type { SimulationOverrides } from "@/lib/routing-fast";
import { StatusCodes } from "@/lib/http/StatusCodes";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { utils, validator } from "@/lib/validator";

import type { LatLng } from "@/lib/map/types";
import { oneOf } from "@/lib/one-of";

export async function POST(req: NextRequest) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const data = await tryParseJson<RequestBody>(req);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{
      message: "Invalid payload.",
    }]).build();
  }

  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      start: {
        type: "object",
        formatterFn: async (value) => {
          if (!utils.isTuple(value as [number, number])) {
            return { ok: false, error: "start must be a [lat, lng] tuple of two numbers." };
          }
          const [lat, lng] = value as [number, number];
          if (!utils.isWithinPhilippines(lat, lng)) {
            return { ok: false, error: "start coordinates must be within the Philippines." };
          }
          return { ok: true };
        },
      },
      end: {
        type: "object",
        formatterFn: async (value) => {
          if (!utils.isTuple(value as [number, number])) {
            return { ok: false, error: "end must be a [lat, lng] tuple of two numbers." };
          }
          const [lat, lng] = value as [number, number];
          if (!utils.isWithinPhilippines(lat, lng)) {
            return { ok: false, error: "end coordinates must be within the Philippines." };
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: ["start", "end"],
    allowUnvalidatedProperties: true,
  });

  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const start: LatLng = data.start;
  const end: LatLng = data.end;
  const overrides: SimulationOverrides = data.overrides ?? {};

  const result = await routingFast.simulateV2MarkII(
    { lat: start[0], lng: start[1] },
    { lat: end[0], lng: end[1] },
    overrides,
  );

  return oneOf(result).match(
    r => ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(r)
      .build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RequestBody = {
  start: [number, number];
  end: [number, number];
  overrides?: SimulationOverrides;
};
