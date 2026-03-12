import { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";
import * as valhalla from "@/lib/osm/valhalla";
import { oneOf } from "@/lib/oneOf";

export async function GET(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  switch (pathname) {
  case "/api/public/osm/valhalla/status":
    const status = await valhalla.status();
    return oneOf(status).match(
      s => {
        return ResponseComposer.compose(StatusCodes.Status200Ok)
          .setBody(s)
          .orchestrate();
      },
      e => {
        return ExceptionResponseComposer.compose(e.value.status_code, [{ error: e.value.error }])
          .orchestrate();
      },
    );
  case "/api/public/osm/valhalla/route":
    // Location
    const queries = req.nextUrl.searchParams.get("json");
    if (!queries) {
      return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
        .orchestrate();
    }

    const payload = tryParseJson<valhalla.ValhallaRouterPayload>(queries);
    if (!payload) {
      return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Malformed Payload." }])
        .orchestrate();
    }

    const route = await valhalla.route(payload);
    return oneOf(route).match(
      s => {
        return ResponseComposer.compose(StatusCodes.Status200Ok)
          .setBody(s)
          .orchestrate();
      },
      e => {
        return ExceptionResponseComposer.compose(e.value.status_code, [{ error: e.value.error }])
          .orchestrate();
      },
    );
  default:
    return ExceptionResponseComposer.compose(StatusCodes.Status404NotFound, [{ message: "Not found." }])
      .orchestrate();
  }
}

function tryParseJson<T>(json: string) {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
