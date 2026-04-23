import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { MultiNavigateResponse } from "@/lib/routing/types";
import { utils } from "@/lib/validator";

export async function route(start: LatLng, end: LatLng): Promise<Result<MultiNavigateResponse>> {
  try {
    const algorithmUrl = process.env.ALGORITHM_URL;
    if (!utils.isExisty(algorithmUrl)) {
      return new Failure(ErrorCodes.Fatal, "Configuration error.", { algorithmUrl: "Not set" });
    }

    const url = new URL("/navigate", algorithmUrl!);
    const request = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ start, end }),
    });

    if (!request.ok) {
      const content = await request.text();
      return new Failure(ErrorCodes.Fatal, "Failed to route", {
        start,
        end,
        status: request.status,
        statusText: request.statusText,
        content,
      });
    }

    const result = await request.json() as MultiNavigateResponse;
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to route", { start, end }, e);
  }
}

export async function invalidate(): Promise<Result<undefined>> {
  try {
    const algorithmUrl = process.env.ALGORITHM_URL;
    if (!utils.isExisty(algorithmUrl)) {
      return new Failure(ErrorCodes.Fatal, "Configuration error.", { algorithmUrl: "Not set" });
    }

    const url = new URL("/cache/invalidate", algorithmUrl!);
    const request = await fetch(url.toString(), {
      method: "POST",
    });

    if (!request.ok) {
      const content = await request.text();
      return new Failure(ErrorCodes.Fatal, "Failed to invalidate", {
        status: request.status,
        statusText: request.statusText,
        content,
      });
    }

    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to invalidate", {}, e);
  }
}

type LatLng = { lat: number, lng: number };
