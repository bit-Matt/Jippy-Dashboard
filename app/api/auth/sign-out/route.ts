import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http";

export async function POST() {
  try {
    await auth.api.signOut({
      headers: await headers(),
    });

    return ResponseComposer.compose<null>(StatusCodes.Status204NoContent)
      .setBody(null)
      .orchestrate();
  } catch (e) {
    Sentry.captureException(e);

    return ResponseComposer.composeError(StatusCodes.Status500InternalServerError, [{
      message: "Failed to sign out.",
    }]).orchestrate();
  }
}
