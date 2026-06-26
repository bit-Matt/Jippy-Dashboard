import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import type { UserRole } from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import { oneOf } from "@/lib/one-of";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, utils } from "@/lib/validator";
import { logActivity } from "@/lib/management/activity-logger";

const ALLOWED_ROLES: UserRole[] = ["administrator_user", "regular_user"];

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/restricted/accounts/users/[id]/role">,
) {
  const currentSession = await auth.verify("administrator_user");
  if (!currentSession || currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession).build();
  }

  const { id } = await params;
  if (!utils.isNonEmpty(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .build();
  }

  const body = await tryParseJson<RoleChangeRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<RoleChangeRequest>(body, {
    properties: {
      role: {
        type: "string",
        formatterFn: async (value) => {
          if (!ALLOWED_ROLES.includes(value as UserRole)) {
            return { ok: false, error: "Role must be administrator_user or regular_user." };
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: ["role"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const previousRole = oneOf(await accounts.getUserById(id)).match(
    user => user.role,
    () => null,
  );

  const result = await accounts.changeRole(id, body.role, currentSession.user!.id);
  return oneOf(result).match(
    user => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: body.role === "administrator_user"
          ? "account_role_promoted"
          : "account_role_demoted",
        summary: `${body.role === "administrator_user" ? "Promoted" : "Demoted"} account ${user.email}`,
        routePath: `/api/restricted/accounts/users/${id}/role`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "account",
        entityId: user.id,
        payload: {
          targetUserId: user.id,
          targetEmail: user.email,
          previousRole,
          newRole: user.role,
        },
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(user).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RoleChangeRequest = {
  role: UserRole;
}
