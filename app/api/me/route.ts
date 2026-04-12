import * as accounts from "@/lib/accounts";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const result = await accounts.getUserById(currentSession.user!.id);
  return oneOf(result).match(
    success => {
      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody(success)
        .orchestrate();
    },
    err => ResponseComposer.composeFromFailure(err).orchestrate(),
  );
}
