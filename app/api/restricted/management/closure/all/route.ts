import * as closure from "@/lib/management/closure-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { unwrap } from "@/lib/one-of";

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  try {
    const result = await unwrap(closure.getAllClosures(false));
    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(result)
      .orchestrate();
  } catch {
    return ResponseComposer.composeError(StatusCodes.Status500InternalServerError, [{
      message: "Unknown error occurred.",
    }]).orchestrate();
  }
}
