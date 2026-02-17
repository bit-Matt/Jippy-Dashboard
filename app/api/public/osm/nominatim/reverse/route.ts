import { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import { FailureCodes } from "@/lib/oneOf/response-types";
import { oneOf } from "@/lib/oneOf";
import { reverse } from "@/lib/osm/nominatim";

export async function GET(req: NextRequest) {
  const latQuery = req.nextUrl.searchParams.get("lat");
  const lonQuery = req.nextUrl.searchParams.get("lon");
  if (!latQuery || !lonQuery) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Missing query parameter." }])
      .orchestrate();
  }

  const lat = Number(latQuery);
  if (Number.isNaN(lat) || !Number.isFinite(lat)) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid latitude." }])
      .orchestrate();
  }

  const lon = Number(lonQuery);
  if (Number.isNaN(lon) || !Number.isFinite(lon)) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid longitude." }])
      .orchestrate();
  }

  const result = await reverse(lat, lon);
  return oneOf(result).match(
    success => {
      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody(success)
        .orchestrate();
    },
    err => {
      if (err.type === FailureCodes.Fatal) {
        return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: "Internal error." }])
          .orchestrate();
      }

      return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid query." }])
        .orchestrate();
    },
  );
}
