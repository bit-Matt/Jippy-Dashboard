import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { utils } from "@/lib/validator";
import { logActivity } from "@/lib/management/activity-logger";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/restricted/accounts/users/[id]">,
) {
  const currentSession = await auth.verify("administrator_user");
  if (!currentSession || currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession).orchestrate();
  }

  const { id } = await params;
  if (!utils.isNonEmpty(id)) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .orchestrate();
  }

  const result = await accounts.toggleBan(id);
  return oneOf(result).match(
    user => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: user.banned ? "account_banned" : "account_unbanned",
        summary: `${user.banned ? "Banned" : "Unbanned"} account ${user.email}`,
        routePath: `/api/restricted/accounts/users/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "account",
        entityId: user.id,
        payload: {
          targetUserId: user.id,
          targetEmail: user.email,
          banned: user.banned,
        },
      });

      return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(user).orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
