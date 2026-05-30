import type { NextRequest } from "next/server";

const BASE_URL = process.env.OSRM_BICYCLE_URL;

function buildResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(upstreamHeaders);

  // Remove hop-by-hop and body-size/encoding headers that can become invalid
  // when relaying through the Next.js runtime.
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  headers.delete("content-encoding");

  return headers;
}

async function proxy(req: NextRequest, { params }: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  if (!BASE_URL) {
    return new Response("OSRM bicycle service is not configured.", { status: 500 });
  }

  const { path } = await params;
  const upstreamPath = (path ?? []).join("/");
  const upstreamUrl = new URL(upstreamPath, `${BASE_URL.replace(/\/+$/, "")}/`);
  upstreamUrl.search = req.nextUrl.search;

  const headers = new Headers(req.headers);
  headers.delete("host");

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.arrayBuffer(),
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: buildResponseHeaders(upstream.headers),
  });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  return proxy(req, ctx);
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  return proxy(req, ctx);
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  return proxy(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  return proxy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  return proxy(req, ctx);
}

export async function OPTIONS(req: NextRequest, ctx: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  return proxy(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: RouteContext<"/api/public/osrm/bicycle/[...path]">) {
  return proxy(req, ctx);
}