import { NextRequest, NextResponse } from "next/server";

const { VALHALLA_URL } = process.env;

export async function GET(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const queries = req.nextUrl.searchParams;

  const toProxyPath = pathname.replace("/api/restricted/osm/valhalla", "");
  try {
    const url = new URL(toProxyPath, VALHALLA_URL);
    for (const [key, value] of queries) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
      },
    });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
