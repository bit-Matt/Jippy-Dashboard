import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validator";

export async function GET() {
  const session = await auth.verify("administrator_user");
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  // Retrieve the list of users
  const users = await accounts.getActiveInvitations();
  return oneOf(users).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify("administrator_user");
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  // Validate inputs
  const body = await tryParseJson<InvitationRequest>(req);
  if (!body) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  const validate = await validator.validate<InvitationRequest>(body, {
    properties: {
      email: { type: "string", formatter: "email" },
    },
    requiredProperties: ["email"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validate.errors!)
      .orchestrate();
  }

  // Create invitation
  const invitation = await accounts.createNewInvitation(body.email);
  return oneOf(invitation).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type InvitationRequest = {
  email: string;
}
