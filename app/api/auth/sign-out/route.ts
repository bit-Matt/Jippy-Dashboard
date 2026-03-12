import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";

export async function POST() {
  try {
    await auth.api.signOut({
      headers: await headers(),
    });

    return ResponseComposer.compose<null>(StatusCodes.Status204NoContent)
      .setBody(null)
      .orchestrate();
  } catch {
    return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{
      message: "Failed to sign out.",
    }]).orchestrate();
  }
}
