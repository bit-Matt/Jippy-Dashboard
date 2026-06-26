import { NextRequest } from "next/server";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { logBannedSignIn } from "@/lib/management/activity-logger";
import {
  ApiResponseBuilder,
  StatusCodes,
  utils as httpUtils,
} from "@/lib/http";
import { validator } from "@/lib/validator";
import { oneOf } from "@/lib/one-of";
import * as turnstile from "@/lib/turnstile";

export async function POST(req: NextRequest) {
  const body = await httpUtils.tryParseJson<SignInRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const validation = await validator.validate<SignInRequest>(body, {
    properties: {
      email: { type: "string", formatter: "email" },
      password: { type: "string", formatter: "non-empty-string" },
      rememberMe: { type: "boolean" },
      token: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["email", "password", "token"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [validation.errors!])
      .build();
  }

  try {
    // Verify turnstile
    const turnstileRawResult = await turnstile.validate(body.token);
    const turnstileResult = oneOf(turnstileRawResult).match(
      s => s,
      () => false,
    );

    if (!turnstileResult) {
      return ApiResponseBuilder
        .createError(StatusCodes.Status401Unauthorized, "Invalid Token!")
        .build();
    }

    await auth.api.signInEmail({
      body: {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe ?? false,
      },
    });

    // Security telemetry for banned accounts that successfully authenticate.
    const [account] = await db
      .select({
        id: user.id,
        role: user.role,
        banned: user.banned,
      })
      .from(user)
      .where(eq(user.email, body.email.toLowerCase()))
      .limit(1);

    if (account?.banned) {
      void logBannedSignIn({
        actorUserId: account.id,
        actorRole: account.role,
      });

      await auth.api.signOut({ headers: await headers() });

      return ApiResponseBuilder
        .createError(StatusCodes.Status403Forbidden, { message: "Your account has been banned." })
        .build();
    }

    return ApiResponseBuilder.create<null>(StatusCodes.Status204NoContent)
      .withBody(null)
      .build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Credentials." }])
      .build();
  }
}

type SignInRequest = {
  email: string;
  password: string;
  rememberMe?: boolean;
  token: string;
}
