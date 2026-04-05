import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";

export async function DELETE(req: NextRequest, { params }: RouteContext<"/api/restricted/accounts/access-tokens/[id]">) {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid token ID" }])
      .orchestrate();
  }

  // Revoke access token
  const token = await accounts.revokeAccessToken(session.user!.id, id);
  return oneOf(token).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

