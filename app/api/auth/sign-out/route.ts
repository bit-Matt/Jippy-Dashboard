import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";

export async function POST() {
  try {
    await auth.api.signOut({
      headers: await headers(),
    });

    return ApiResponseBuilder.create<null>(StatusCodes.Status204NoContent)
      .withBody(null)
      .build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(StatusCodes.Status500InternalServerError, [{
      message: "Failed to sign out.",
    }]).build();
  }
}
