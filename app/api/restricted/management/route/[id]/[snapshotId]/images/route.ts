import type { NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as imageManager from "@/lib/management/image-manager";
import { oneOf } from "@/lib/one-of";
import { Failure } from "@/lib/one-of/types";
import { utils } from "@/lib/validator";

export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/[snapshotId]/images">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id) || !utils.isUuid(snapshotId)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No such snapshot found." }])
      .build();
  }

  const snapshotResult = await imageManager.verifySnapshotBelongsToRoute(id, snapshotId);
  if (snapshotResult instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(snapshotResult).build();
  }

  const result = await imageManager.getSnapshotImages(snapshotId);
  return oneOf(result).match(
    images => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(images).build(),
    failure => ApiResponseBuilder.createFromFailure(failure).build(),
  );
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/[snapshotId]/images">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id, snapshotId } = await params;

  if (!utils.isUuid(id) || !utils.isUuid(snapshotId)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No such snapshot found." }])
      .build();
  }

  const snapshotResult = await imageManager.verifySnapshotBelongsToRoute(id, snapshotId);
  if (snapshotResult instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(snapshotResult).build();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid form data." }])
      .build();
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Image file is required." }])
      .build();
  }

  const result = await imageManager.validateAndSaveImage(
    file,
    snapshotId,
    currentSession.user!.id,
  );

  return oneOf(result).match(
    image => ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(image).build(),
    failure => ApiResponseBuilder.createFromFailure(failure).build(),
  );
}
