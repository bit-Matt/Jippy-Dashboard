import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import { getUser } from "@/lib/accounts";
import { oneOf } from "@/lib/oneOf";
import { FailureCodes } from "@/lib/oneOf/response-types";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return ExceptionResponseComposer.compose(StatusCodes.Status401Unauthorized, [{ message: "Unauthorized." }])
      .orchestrate();
  }

  const result = await getUser(session.user.id);
  return oneOf(result).match(
    success => {
      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody(success)
        .orchestrate();
    },
    err => {
      if (err.type === FailureCodes.Fatal) {
        return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Internal error." }])
          .orchestrate();
      }

      // Make it not obvious that the user cannot be found.
      return ExceptionResponseComposer.compose(StatusCodes.Status401Unauthorized, [{ message: "Unauthorized." }])
        .orchestrate();
    },
  );
}
