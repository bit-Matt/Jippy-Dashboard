import type { NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as imageManager from "@/lib/management/image-manager";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/[snapshotId]/images/[imageId]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id, snapshotId, imageId } = await params;

  if (!utils.isUuid(id) || !utils.isUuid(snapshotId) || !utils.isUuid(imageId)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Image not found." }])
      .build();
  }

  const result = await imageManager.deleteImage(id, snapshotId, imageId);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(null).build(),
    failure => ApiResponseBuilder.createFromFailure(failure).build(),
  );
}
