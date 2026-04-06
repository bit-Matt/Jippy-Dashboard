import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";
import { ResponseComposer, StatusCodes } from "@/lib/http";

export async function GET(req: NextRequest) {
  const currentSession = await auth.verify("administrator_user");
  if (!currentSession || currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession).orchestrate();
  }

  const result = await accounts.getAllAccounts();
  const status = req.nextUrl.searchParams.get("status");

  return oneOf(result).match(
    users => {
      if (status === "banned") {
        return ResponseComposer
          .compose(StatusCodes.Status200Ok)
          .setBody(users.filter(user => user.banned))
          .orchestrate();
      }

      if (status === "active") {
        return ResponseComposer
          .compose(StatusCodes.Status200Ok)
          .setBody(users.filter(user => !user.banned))
          .orchestrate();
      }

      return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(users).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
