import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import {
  ResponseComposer,
  StatusCodes,
  utils as httpUtils,
} from "@/lib/http";
import { validator } from "@/lib/validator";

export async function POST(req: NextRequest) {
  const body = await httpUtils.tryParseJson<SignInRequest>(req);
  if (!body) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
  }

  const validation = await validator.validate<SignInRequest>(body, {
    properties: {
      email: { type: "string", formatter: "email" },
      password: { type: "string", formatter: "non-empty-string" },
      rememberMe: { type: "boolean" },
    },
    requiredProperties: ["email", "password"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  try {
    await auth.api.signInEmail({
      body: {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe ?? false,
      },
    });

    return ResponseComposer.compose<null>(StatusCodes.Status204NoContent)
      .setBody(null)
      .orchestrate();
  } catch (e) {
    Sentry.captureException(e);

    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid Credentials." }])
      .orchestrate();
  }
}

type SignInRequest = {
  email: string;
  password: string;
  rememberMe?: boolean;
}
