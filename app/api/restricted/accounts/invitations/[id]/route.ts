import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";
import { logActivity } from "@/lib/management/activity-logger";

export async function DELETE(
  req: NextRequest,
  { params }: RouteContext<"/api/restricted/accounts/invitations/[id]">,
) {
  const session = await auth.verify("administrator_user");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Get ID from parameter
  const { id } = await params;
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .build();
  }

  // Attempt to delete
  const result = await accounts.revokeInvitation(id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: session.user!.id,
        actorRole: session.user!.role,
        category: "write_operation",
        action: "invitation_revoked",
        summary: `Revoked invitation for ${s.email}`,
        routePath: `/api/restricted/accounts/invitations/${id}`,
        httpMethod: "DELETE",
        statusCode: StatusCodes.Status204NoContent,
        entityType: "invitation",
        entityId: s.id,
        payload: {
          targetEmail: s.email,
        },
      });

      return ApiResponseBuilder.create(StatusCodes.Status204NoContent).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext<"/api/restricted/accounts/invitations/[id]">,
) {
  const session = await auth.verify("administrator_user");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder
      .createFromSessionValidation(session)
      .build();
  }

  const { id } = await params;
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .build();
  }

  const result = await accounts.resendInvitation(id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: session.user!.id,
        actorRole: session.user!.role,
        category: "write_operation",
        action: "invitation_resent",
        summary: `Resent invitation to ${s.email}`,
        routePath: `/api/restricted/accounts/invitations/${id}`,
        httpMethod: "POST",
        statusCode: StatusCodes.Status200Ok,
        entityType: "invitation",
        entityId: id,
        payload: {
          targetEmail: s.email,
          sent: !Boolean(s.errors),
        },
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody({ errors: s.errors, sent: !Boolean(s.errors) })
        .build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
