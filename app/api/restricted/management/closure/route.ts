import type { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { utils, validator } from "@/lib/validator";

export async function GET() {
  try {
    const closures = await management.getAllClosures();

    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(closures)
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}

export async function POST(req: NextRequest) {
  const data = await tryParseJson<RequestBody>(req);

  if (!data) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
  }

  if (data.type !== "line" && data.type !== "region") {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid closure type." }])
      .orchestrate();
  }

  const baseValidation = await validator.validate<RequestBody>(data, {
    properties: {
      label: { type: "string", formatter: "non-empty-string" },
      color: { type: "string", formatter: "hex-color" },
      type: { type: "string", formatterFn: async value => (value === "line" || value === "region"
        ? { ok: true }
        : { ok: false, error: "Invalid closure type." }) },
      direction: {
        type: "string",
        formatterFn: async value => {
          if (data.type === "line") {
            return value === "one_way" || value === "both"
              ? { ok: true }
              : { ok: false, error: "Invalid direction." };
          }
          return { ok: true };
        },
      },
      points: {
        type: "object",
        formatterFn: async values => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "Invalid points." };
          }

          if (values.length < 2) {
            return { ok: false, error: "At least 2 points are required." };
          }

          for (const point of values) {
            if (!utils.isExisty(point.sequence) || !utils.isFinite(point.sequence)) {
              return { ok: false, error: "Invalid sequence." };
            }

            if (!utils.isExisty(point.point) || !utils.isTuple(point.point)) {
              return { ok: false, error: "Invalid point." };
            }

            if (data.type === "line") {
              if (!utils.isExisty(point.address) || !utils.isNonEmpty(point.address)) {
                return { ok: false, error: "Invalid address." };
              }
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["label", "color", "type", "points"],
    allowUnvalidatedProperties: false,
  });

  if (!baseValidation.ok) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [baseValidation.errors!])
      .orchestrate();
  }

  try {
    if (data.type === "line") {
      const result = await management.addClosureLine({
        label: data.label,
        color: data.color,
        direction: data.direction ?? "both",
        points: data.points.map(p => ({
          sequence: p.sequence,
          address: p.address!,
          point: p.point,
        })),
      });

      return ResponseComposer.compose(StatusCodes.Status201Created)
        .setBody(result)
        .orchestrate();
    }

    const result = await management.addClosureRegion({
      label: data.label,
      color: data.color,
      points: data.points.map(p => ({
        sequence: p.sequence,
        point: p.point,
      })),
    });

    return ResponseComposer.compose(StatusCodes.Status201Created)
      .setBody(result)
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Internal Server Error." }])
      .orchestrate();
  }
}

type RequestBody = {
  label: string;
  color: string;
  type: "line" | "region";
  direction?: "one_way" | "both";
  points: Array<{
    sequence: number;
    address?: string;
    point: [number, number];
  }>;
}

