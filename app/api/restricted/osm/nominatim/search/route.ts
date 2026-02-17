import { headers } from "next/headers";
import { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import { FailureCodes } from "@/lib/oneOf/response-types";
import { oneOf } from "@/lib/oneOf";
import { searchRestricted } from "@/lib/osm/nominatim";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return ExceptionResponseComposer.compose(StatusCodes.Status401Unauthorized, [{ message: "Unauthorized." }])
      .orchestrate();
  }

  const query = req.nextUrl.searchParams.get("q");
  if (!query) {
    return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Missing query parameter." }])
      .orchestrate();
  }

  const result = await searchRestricted(query);
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
