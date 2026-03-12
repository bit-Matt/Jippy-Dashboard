import type { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { utils, validator } from "@/lib/validator";

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

            if (!utils.isExisty(point.point) || !utils.isTuple(point.point)) {
              return { ok: false, error: "Invalid point." };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["regionName", "regionColor", "regionShape", "points", "stations"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  try {
    const result = await management.createRegion(data);
    return ResponseComposer.compose(StatusCodes.Status201Created)
      .setBody(result)
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Internal Server Error." }])
      .orchestrate();
  }
}

type RequestBody = {
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<{
    sequence: number;
    point: [number, number];
  }>;
  stations: Array<{
    address: string;
    point: [number, number];
  }>;
}
