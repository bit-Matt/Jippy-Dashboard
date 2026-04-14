import type { NextRequest } from "next/server";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as route from "@/lib/management/route-manager";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No route found with the given ID." }])
      .build();
  }

  if (!utils.isUuid(snapshotId)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No snapshot found with the given ID." }])
      .build();
  }

  const result = await route.getSnapshotPoints(id, snapshotId);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
