import type { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/oneOf";
import { Failure, FailureCodes } from "@/lib/oneOf/response-types";
import { db } from "@/lib/db";
import { roadClosures, roadClosureSequences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { utils, validator } from "@/lib/validator";

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]">,
) {
  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid payload." }])
      .orchestrate();
  }

  const hasAnyPatchField =
    data.label !== undefined
    || data.color !== undefined
    || data.direction !== undefined
    || data.points !== undefined;

  if (!hasAnyPatchField) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .orchestrate();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
    properties: {
      label: { type: "string", formatter: "non-empty-string" },
      color: { type: "string", formatter: "hex-color" },
      direction: {
        type: "string",
        formatterFn: async value => (value === "one_way" || value === "both"
          ? { ok: true }
          : { ok: false, error: "Invalid direction." }),
      },
      points: {
        type: "object",
        formatterFn: async values => {
          if (!values) return { ok: true };

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
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });

  if (!validation.ok) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  const result = await updateClosure(id, data);
  return oneOf(result).match(
    success => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(success)
      .orchestrate(),
    e => {
      if (e.type === FailureCodes.ResourceNotFound) {
        return ExceptionResponseComposer.compose(StatusCodes.Status404NotFound, [{ message: "Closure not found" }])
          .orchestrate();
      }

      return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Failed to update closure" }])
        .orchestrate();
    },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]">,
) {
  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  const result = await removeClosure(id);
  return oneOf(result).match(
    () => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({ ok: true })
      .orchestrate(),
    e => {
      if (e.type === FailureCodes.ResourceNotFound) {
        return ExceptionResponseComposer.compose(StatusCodes.Status404NotFound, [{ message: "Closure not found" }])
          .orchestrate();
      }

      return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Failed to delete closure" }])
        .orchestrate();
    },
  );
}

async function removeClosure(id: string) {
  try {
    const [closure] = await db
      .select({ id: roadClosures.id })
      .from(roadClosures)
      .where(eq(roadClosures.id, id))
      .limit(1);

    if (!closure) {
      return new Failure(FailureCodes.ResourceNotFound, "Closure not found");
    }

    await db.delete(roadClosures).where(eq(roadClosures.id, id));
    return new management.Success(null);
  } catch {
    return new Failure(FailureCodes.Fatal, "Failed to delete closure");
  }
}

async function updateClosure(id: string, params: PatchRequestBody) {
  try {
    const [closure] = await db
      .select()
      .from(roadClosures)
      .where(eq(roadClosures.id, id))
      .limit(1);

    if (!closure) {
      return new Failure(FailureCodes.ResourceNotFound, "Closure not found");
    }

    const updated = await db.transaction(async tx => {
      const patch: Partial<{
        label: string;
        color: string;
        direction: "one_way" | "both";
      }> = {};

      if (params.label !== undefined) patch.label = params.label;
      if (params.color !== undefined) patch.color = params.color;
      if (params.direction !== undefined) patch.direction = params.direction;

      if (Object.keys(patch).length > 0) {
        await tx
          .update(roadClosures)
          .set(patch)
          .where(eq(roadClosures.id, id));
      }

      if (params.points !== undefined) {
        await tx
          .delete(roadClosureSequences)
          .where(eq(roadClosureSequences.closureId, id));

        if (params.points.length > 0) {
          await tx
            .insert(roadClosureSequences)
            .values(
              params.points.map(point => ({
                closureId: id,
                sequenceNumber: point.sequence,
                address: point.address,
                point: [point.point[1], point.point[0]] as [number, number],
              })),
            );
        }
      }

      const refreshed = await management.getAllClosures();
      const targetArray = closure.type === "line" ? refreshed.lineClosures : refreshed.regionClosures;
      const updatedClosure = targetArray.find(c => c.id === id);

      if (!updatedClosure) {
        return new Failure(FailureCodes.Fatal, "Failed to load updated closure.");
      }

      return updatedClosure;
    });

    return updated;
  } catch {
    return new Failure(FailureCodes.Fatal, "Failed to update closure");
  }
}

type PatchRequestBody = {
  label?: string;
  color?: string;
  direction?: "one_way" | "both";
  points?: Array<{
    sequence: number;
    address?: string;
    point: [number, number];
  }>;
}

