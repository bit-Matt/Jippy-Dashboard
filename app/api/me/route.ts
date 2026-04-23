import * as accounts from "@/lib/accounts";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const result = await accounts.getUserById(currentSession.user!.id);
  return oneOf(result).match(
    success => {
      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody(success)
        .build();
    },
    err => ApiResponseBuilder.createFromFailure(err).build(),
  );
}
