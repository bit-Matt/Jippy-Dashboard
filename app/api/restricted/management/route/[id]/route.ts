import type { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as management from "@/lib/management";
import { oneOf } from "@/lib/oneOf";
import { FailureCodes } from "@/lib/oneOf/response-types";
import { utils } from "@/lib/validator";

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]">,
) {
  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid route ID" }])
      .orchestrate();
  }

  const result = await management.removeRoute(id);
  return oneOf(result).match(
    () => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({ ok: true })
      .orchestrate(),
    e => {
      if (e.type === FailureCodes.ResourceNotFound) {
        return ExceptionResponseComposer.compose(StatusCodes.Status404NotFound, [{ message: "Route not found" }])
          .orchestrate();
      }

      return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Failed to delete route" }])
        .orchestrate();
    },
  );
}
