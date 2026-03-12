import type { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/oneOf";
import { FailureCodes } from "@/lib/oneOf/response-types";
import { utils, validator } from "@/lib/validator";

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]">,
) {
  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid route ID" }])
      .orchestrate();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid payload." }])
      .orchestrate();
  }

  const hasAnyPatchField =
    data.regionName !== undefined
    || data.regionColor !== undefined
    || data.regionShape !== undefined
    || data.points !== undefined
    || data.stations !== undefined;
  if (!hasAnyPatchField) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .orchestrate();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
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
            return { ok: false, error: "At least 2 points are required." };
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
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  const result = await management.updateRegion(id, data);
  return oneOf(result).match(
    success => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(success)
      .orchestrate(),
    e => {
      if (e.type === FailureCodes.ResourceNotFound) {
        return ExceptionResponseComposer.compose(StatusCodes.Status404NotFound, [{ message: "Route not found" }])
          .orchestrate();
      }

      return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Failed to update route" }])
        .orchestrate();
    },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]">,
) {
  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid route ID" }])
      .orchestrate();
  }

  const result = await management.removeRegion(id);
  return oneOf(result).match(
    () => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({ ok: true })
      .orchestrate(),
    e => {
      if (e.type === FailureCodes.ResourceNotFound) {
        return ExceptionResponseComposer.compose(StatusCodes.Status404NotFound, [{ message: "Route not found" }])
          .orchestrate();
      }

      return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Failed to delete route" }])
        .orchestrate();
    },
  );
}

type PatchRequestBody = {
  regionName?: string;
  regionColor?: string;
  regionShape?: string;
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
  stations?: Array<{
    address: string;
    point: [number, number];
  }>;
}
