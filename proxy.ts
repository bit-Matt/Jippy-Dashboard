import { LRUCache } from "lru-cache";
import { NextResponse, type NextRequest } from "next/server";

import { ResponseComposer, StatusCodes, utils } from "@/lib/http";

const tokenCache = new LRUCache<string, number>({
  max: 5000,
  ttl: 1000,
});

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/public")) {
    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";

    const tokenCount = tokenCache.get(ip) || 0;

    if (tokenCount >= 1) {
      return ResponseComposer.composeError(StatusCodes.Status429TooManyRequests, [{ message: "Too many requests "}])
        .orchestrate();
    }

    // Increment and set
    tokenCache.set(ip, tokenCount + 1);
  }

  if (request.nextUrl.pathname.startsWith("/api/restricted")) {
    const isAllowed = await utils.verifyAPIKeyOrSession(request);

    if (!isAllowed) {
      return ResponseComposer.composeError(StatusCodes.Status401Unauthorized, [{ message: "Unauthorized" }])
        .orchestrate();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/public/:path*",
    "/api/restricted/:path*",
  ],
};
