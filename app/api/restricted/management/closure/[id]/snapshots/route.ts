import type { NextRequest } from "next/server";

import * as closure from "@/lib/management/closure-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";
import { session, SessionCode } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/closure/[id]/snapshots">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{message: "No such closure ID found"}])
      .orchestrate();
  }

  const result = await closure.getAllSnapshots(id);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status201Created).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
