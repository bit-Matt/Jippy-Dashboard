import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";

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
  } catch (e) {
    return null;
  }
}

/**
 * Retrieves the API key or session details from the given request.
 * This method handles the extraction of authentication information based on the request structure.
 *
 * @param {NextRequest} req - The incoming request object containing the necessary headers or cookies to identify the
 *                            API key or session.
 * @return {Promise<boolean>} A promise that resolves to the API key, session identifier, or null if neither is found.
 */
export async function verifyAPIKeyOrSession(req: NextRequest): Promise<boolean> {
  // Check for session first
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // If session found, grant access.
  if (session) {
    return true;
  }

  const APPLICATION_ID = req.headers.get("X-Application-Id");
  const APPLICATION_SECRET = req.headers.get("X-Application-Secret");

  // No such keys found on the header
  if (!APPLICATION_ID || !APPLICATION_SECRET) return false;

  // TODO: Check for API key

  return false;
}
