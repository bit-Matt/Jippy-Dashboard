import { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer, StatusCodes } from "@/lib/http";

const { NOMINATIM_URL } = process.env;

export async function GET(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const queries = req.nextUrl.searchParams;

  const toProxyPath = pathname.replace("/api/public/osm/nominatim", "");
  try {
    const url = new URL(toProxyPath, NOMINATIM_URL);
    for (const [key, value] of queries) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
      },
    });
    const data = await response.json();
    return ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(data)
      .orchestrate();
  } catch {
    return ExceptionResponseComposer
      .compose(StatusCodes.Status500InternalServerError, [{ message: "Internal error." }])
      .orchestrate();
  }
}
