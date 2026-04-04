import type { NextRequest } from "next/server";

import { ResponseComposer, StatusCodes } from "@/lib/http";
import * as route from "@/lib/management/route-manager";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]/snapshots">,
) {
  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such route ID found" }])
      .orchestrate();
  }

  const result = await route.getAllSnapshotByRouteId(id);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status201Created).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
