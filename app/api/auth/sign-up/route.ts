import { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { oneOf } from "@/lib/one-of";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validator";

export async function POST(request: NextRequest) {
  const body = await tryParseJson<EnrollmentRequirements>(request);
  if (!body) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .orchestrate();
  }

  // Validate the request body
  const validation = await validator.validate<EnrollmentRequirements>(body, {
    properties: {
      fullName: {
        type: "string",
        formatter: "non-empty-string",
      },
      password: {
        type: "string",
        formatter: "strong-password",
      },
      token: {
        type: "string",
        formatter: "non-empty-string",
      },
    },
    requiredProperties: ["fullName", "password", "token"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  // Enrollment
  const result = await accounts.enroll(body);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type EnrollmentRequirements = {
    fullName: string;
    password: string;
    token: string;
}
