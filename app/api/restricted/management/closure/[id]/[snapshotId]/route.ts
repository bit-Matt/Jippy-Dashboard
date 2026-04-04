import type { NextRequest } from "next/server";

import * as closure from "@/lib/management/closure-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid snapshot ID" }])
      .orchestrate();
  }

  const result = await closure.getClosureById(id, snapshotId);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid snapshot ID" }])
      .orchestrate();
  }

  const result = await closure.copySnapshot(id, snapshotId);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]/[snapshotId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid closure ID" }])
      .orchestrate();
  }

  if (!utils.isUuid(snapshotId)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid snapshot ID" }])
      .orchestrate();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid payload." }])
      .orchestrate();
  }

  const hasAnyPatchField =
    data.versionName !== undefined
    || data.shape !== undefined
    || data.closureName !== undefined
    || data.closureDescription !== undefined
    || data.points !== undefined;
  if (!hasAnyPatchField) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .orchestrate();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
    properties: {
      versionName: { type: "string", formatter: "non-empty-string" },
      shape: { type: "string", formatter: "non-empty-string" },
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
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  const result = await closure.updateClosure(id, snapshotId, data);
  return oneOf(result).match(
    success => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(success)
      .orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type PatchRequestBody = {
  versionName?: string;
  shape?: string;
  closureName?: string;
  closureDescription?: string;
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
}
