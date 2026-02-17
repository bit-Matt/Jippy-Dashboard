import { NextRequest } from "next/server";

import { search } from "@/lib/osm/nominatim";
import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import { oneOf } from "@/lib/oneOf";
import { FailureCodes } from "@/lib/oneOf/response-types";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Missing query parameter." }])
      .orchestrate();
  }

  const result = await search(query);
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
