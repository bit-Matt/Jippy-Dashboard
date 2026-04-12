import type { NextRequest } from "next/server";

/**
 * Attempts to parse the JSON body from the given request. If the parsing fails,
 * the exception is captured and logged, and the method returns null.
 *
 * @template T The type of the JSON object to parse.
 * @param {NextRequest} req - The incoming HTTP request object to parse the JSON from.
 * @return {Promise<T>} A promise that resolves to the parsed JSON object if successful, or null if parsing fails.
 */
export async function tryParseJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return req.json();
  } catch {
    return null;
  }
}
