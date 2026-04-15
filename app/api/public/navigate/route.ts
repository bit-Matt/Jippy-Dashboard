import { type NextRequest } from "next/server";

import { ApiResponseBuilder } from "@/lib/http/ApiResponseBuilder";
import { StatusCodes } from "@/lib/http/StatusCodes";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { utils, validator } from "@/lib/validator";
import { computeRoute } from "@/lib/routing";

import type { LatLng } from "@/lib/routing/types";

type RequestBody = {
  start: [number, number];
  end: [number, number];
};

export async function POST(req: NextRequest) {
  try {
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
            if (!isWithinPhilippines(lat, lng)) {
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
            if (!isWithinPhilippines(lat, lng)) {
              return { ok: false, error: "end coordinates must be within the Philippines." };
            }
            return { ok: true };
          },
        },
      },
      requiredProperties: ["start", "end"],
      allowUnvalidatedProperties: false,
    });

    if (!validation.ok) {
      return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
        .build();
    }

    const start: LatLng = data.start;
    const end: LatLng = data.end;

    const result = await computeRoute(start, end);

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(result)
      .build();
  } catch (error) {
    console.error("[navigate] Route computation failed:", error);

    const isValhallaError =
      error instanceof Error &&
      error.message.includes("Valhalla");

    if (isValhallaError) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status503ServiceUnavailable,
        { message: "Routing engine is temporarily unavailable." },
      ).build();
    }

    return ApiResponseBuilder.createError(
      StatusCodes.Status500InternalServerError,
      { message: "An unexpected error occurred while computing the route." },
    ).build();
  }
}

function isWithinPhilippines(lat: number, lng: number): boolean {
  // Generous bounds for the Philippines archipelago
  return lat >= 4.5 && lat <= 21.5 && lng >= 116.0 && lng <= 127.0;
}
