import type { NextRequest } from "next/server";

import * as region from "@/lib/management/region-manager";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/one-of";
import { utils } from "@/lib/validator";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]/snapshots">,
) {
  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{ message: "No such region ID found" }])
      .orchestrate();
  }

  const result = await region.getAllSnapshots(id);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status201Created).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
