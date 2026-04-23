import { LRUCache } from "lru-cache";
import { NextResponse, type NextRequest } from "next/server";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http";

const tokenCache = new LRUCache<string, number>({
  max: 5000,
  ttl: 1000,
});

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/public")) {
    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";

    const tokenCount = tokenCache.get(ip) || 0;

    if (tokenCount >= 1) {
      return ApiResponseBuilder.createError(StatusCodes.Status429TooManyRequests, [{ message: "Too many requests "}])
        .build();
    }

    // Increment and set
    tokenCache.set(ip, tokenCount + 1);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/public/:path*",
    "/api/restricted/:path*",
  ],
};
