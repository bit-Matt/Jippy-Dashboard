import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validator";
import { logActivity } from "@/lib/management/activity-logger";

export async function GET() {
  const session = await auth.verify("administrator_user");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Retrieve the list of users
  const users = await accounts.getActiveInvitations();
  return oneOf(users).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify("administrator_user");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Validate inputs
  const body = await tryParseJson<InvitationRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<InvitationRequest>(body, {
    properties: {
      email: { type: "string", formatter: "email" },
    },
    requiredProperties: ["email"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  // Create invitation
  const invitation = await accounts.createNewInvitation(body.email);
  return oneOf(invitation).match(
    s => {
      void logActivity({
        actorUserId: session.user!.id,
        actorRole: session.user!.role,
        category: "write_operation",
        action: "invitation_sent",
        summary: `Sent invitation to ${body.email}`,
        routePath: "/api/restricted/accounts/invitations",
        httpMethod: "POST",
        statusCode: StatusCodes.Status200Ok,
        entityType: "invitation",
        entityId: s.id,
        payload: {
          targetEmail: body.email,
          sent: !Boolean(s.errors),
        },
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type InvitationRequest = {
  email: string;
}
