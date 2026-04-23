import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";

export async function GET(req: NextRequest) {
  const currentSession = await auth.verify("administrator_user");
  if (!currentSession || currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession).build();
  }

  const result = await accounts.getAllAccounts();
  const status = req.nextUrl.searchParams.get("status");

  return oneOf(result).match(
    users => {
      if (status === "banned") {
        return ApiResponseBuilder
          .create(StatusCodes.Status200Ok)
          .withBody(users.filter(user => user.banned))
          .build();
      }

      if (status === "active") {
        return ApiResponseBuilder
          .create(StatusCodes.Status200Ok)
          .withBody(users.filter(user => !user.banned))
          .build();
      }

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(users).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
