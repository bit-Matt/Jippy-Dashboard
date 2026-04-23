import { NextRequest } from "next/server";
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
    },
    requiredProperties: ["email", "password"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [validation.errors!])
      .build();
  }

  try {
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
}
