import type { NextRequest } from "next/server";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as feedback from "@/lib/management/feedback-manager";
import { oneOf } from "@/lib/one-of";
import { validator } from "@/lib/validator";

export async function POST(req: NextRequest) {
  const data = await tryParseJson<RequestBody>(req);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      email: { type: "string", formatter: "email" },
      type: { type: "string", formatter: "non-empty-string" },
      details: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["email", "type", "details"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await feedback.createFeedback({
    email: data.email,
    type: data.type,
    details: data.details,
  });

  return oneOf(result).match(
    (created) => {
      return ApiResponseBuilder.create(StatusCodes.Status201Created)
        .withBody(created)
        .build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RequestBody = {
  email: string;
  type: string;
  details: string;
};
