import type { NextRequest } from "next/server";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as imageManager from "@/lib/management/image-manager";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";

export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/api/public/images/[imageId]">,
) {
  const { imageId: imageIdParam } = await params;
  const imageId = imageManager.parseImageIdFromParam(imageIdParam);

  if (!utils.isUuid(imageId)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Image not found." }])
      .build();
  }

  const result = await imageManager.serveImage(imageId);
  return oneOf(result).match(
    ({ buffer, mimeType }) => new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }),
    failure => ApiResponseBuilder.createFromFailure(failure).build(),
  );
}
