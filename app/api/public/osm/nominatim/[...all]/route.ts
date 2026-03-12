import { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as nominatim from "@/lib/osm/nominatim";
import { oneOf } from "@/lib/oneOf";

export async function GET(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const queries = req.nextUrl.searchParams;

  const payload: Record<string, string> = {};
  queries.forEach((value, key) => payload[key] = value);

  switch (pathname) {
  case "/api/public/osm/nominatim/reverse":
    const reverse = await nominatim.reverse(payload);
    return oneOf(reverse).match(
      s => {
        return ResponseComposer.compose(StatusCodes.Status200Ok)
          .setBody(s)
          .orchestrate();
      },
      e => {
        return ExceptionResponseComposer.compose(e.value.error.code, [{ error: e.value.error.message }])
          .orchestrate();
      },
    );
  case "/api/public/osm/nominatim/search":
    const search = await nominatim.search(payload);
    return oneOf(search).match(
      s => {
        return ResponseComposer.compose(StatusCodes.Status200Ok)
          .setBody(s)
          .orchestrate();
      },
      e => {
        return ExceptionResponseComposer.compose(e.value.error.code, [{ error: e.value.error.message }])
          .orchestrate();
      },
    );
  default:
    return ExceptionResponseComposer.compose(StatusCodes.Status404NotFound, [{ message: "Not found." }])
      .orchestrate();
  }
}
