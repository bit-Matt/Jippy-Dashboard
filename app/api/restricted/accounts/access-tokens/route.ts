import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validator";

export async function GET() {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  // Retrieve the list of users
  const users = await accounts.getAllAccessToken(session.user!.id);
  return oneOf(users).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  // Validate inputs
  const body = await tryParseJson<CreateAccessTokenPayload>(req);
  if (!body) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  const validate = await validator.validate<CreateAccessTokenPayload>(body, {
    properties: {
      permission: {
        type: "string",
        formatterFn: async v => {
          if (v !== "r" && v !== "rw") {
            return { ok: false, error: "Invalid permission: " + v };
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["permission"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validate.errors!)
      .orchestrate();
  }

  // Create access token
  const token = await accounts.createAccessToken(session.user!.id, body.permission);
  return oneOf(token).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type CreateAccessTokenPayload = {
  permission: "r" | "rw";
}
