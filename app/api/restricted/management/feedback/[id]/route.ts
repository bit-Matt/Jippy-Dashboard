import type { NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { logActivity } from "@/lib/management/activity-logger";
import * as feedback from "@/lib/management/feedback-manager";
import { oneOf } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";

const FEEDBACK_STATES: feedback.FeedbackState[] = ["Active", "Resolved", "Closed"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Feedback entry not found." }])
      .build();
  }

  const data = await tryParseJson<RequestBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      state: {
        type: "string",
        formatterFn: async (value) => {
          if (!FEEDBACK_STATES.includes(value as feedback.FeedbackState)) {
            return { ok: false, error: "state must be one of Active, Resolved, or Closed." };
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["state"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await feedback.updateFeedback(id, data.state as feedback.FeedbackState);
  return oneOf(result).match(
    (updated) => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "feedback_state_updated",
        summary: `Updated feedback ${updated.id} state to ${updated.state}`,
        routePath: `/api/restricted/management/feedback/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "feedback",
        entityId: updated.id,
        payload: { state: data.state },
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody(updated)
        .build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RequestBody = {
  state: string;
};
