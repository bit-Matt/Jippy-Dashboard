import type { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { utils, validator } from "@/lib/validator";

export async function GET() {
  try {
    const allRoutes = await management.getAllRoutes();
    const allRegions = await management.getAllRegions();

    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({
        routes: allRoutes,
        regions: allRegions,
      })
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}

export async function POST(req: NextRequest) {
  const data = await tryParseJson<RequestBody>(req);

  // Body is unparseable.
  if (!data) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
  }

  // Validate the body first.
  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      routeNumber: { type: "string", formatter: "non-empty-string" },
      routeName: { type: "string", formatter: "non-empty-string" },
      routeColor: { type: "string", formatter: "hex-color" },
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
    requiredProperties: ["routeNumber", "routeName", "routeColor", "points"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  try {
    const result = await management.addRoute(data);
    return ResponseComposer.compose(StatusCodes.Status201Created)
      .setBody(result)
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Internal Server Error." }])
      .orchestrate();
  }
}

type RequestBody = {
  routeNumber: string;
  routeName: string;
  routeColor: string;
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
    }>
  }
}
