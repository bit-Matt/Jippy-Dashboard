import type { NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as feedback from "@/lib/management/feedback-manager";
import { oneOf } from "@/lib/one-of";
import { validator } from "@/lib/validator";

const FEEDBACK_STATES: feedback.FeedbackState[] = ["Active", "Resolved", "Closed"];

export async function GET(request: NextRequest) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10);
  const stateInput = searchParams.get("state")?.trim();
  const state = stateInput && stateInput.length > 0 ? stateInput : undefined;

  const validation = await validator.validate<QueryInput>({ page, limit, state }, {
    properties: {
      page: { type: "number", formatter: "positive-integer" },
      limit: {
        type: "number",
        formatterFn: async (value) => {
          if (!Number.isInteger(value) || value < 1 || value > 100) {
            return { ok: false, error: "limit must be an integer between 1 and 100." };
          }

          return { ok: true };
        },
      },
      state: {
        type: "string",
        formatterFn: async (value) => {
          if (value === undefined) {
            return { ok: true };
          }

          if (!FEEDBACK_STATES.includes(value as feedback.FeedbackState)) {
            return { ok: false, error: "state must be one of Active, Resolved, or Closed." };
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["page", "limit"],
    allowUnvalidatedProperties: false,
  });

  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await feedback.getAllFeedbacks({
    page,
    limit,
    ...(state !== undefined && { state: state as feedback.FeedbackState }),
  });

  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type QueryInput = {
  page: number;
  limit: number;
  state?: string;
};
