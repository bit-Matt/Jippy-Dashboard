import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { getUser } from "@/lib/accounts";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return ResponseComposer.composeError(StatusCodes.Status401Unauthorized, [{ message: "Unauthorized." }])
      .orchestrate();
  }

  const result = await getUser(session.user.id);
  return oneOf(result).match(
    success => {
      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody(success)
        .orchestrate();
    },
    err => ResponseComposer.composeFromFailure(err).orchestrate(),
  );
}
