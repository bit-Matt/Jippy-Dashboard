import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { nextCookies } from "better-auth/next-js";
import * as Sentry from "@sentry/nextjs";
import { unwrap } from "@/lib/one-of";

import { db } from "@/lib/db";
import { getUserById, type User } from "@/lib/accounts";
import { logBannedAccessAttempt } from "@/lib/management/activity-logger";
import { utils } from "./validator";

export const auth = betterAuth({
  basePath: process.env.BETTER_AUTH_URL as string,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true },
    },
  },
  plugins: [nextCookies()],
});

export const session = {
  /**
   * Verifies if the user has the required permissions.
   * @param {string} [role] - Role that is allowed on this API
   * @returns {Promise<{ session: SessionType, user: User }>}
   */
  verify: async (role?: string): Promise<SessionVerifiedResult> => {
    const nextHeaders = await headers();

    try {
      const session = await auth.api.getSession({
        headers: nextHeaders,
      });

      // No session found.
      if (!session) {
        // Log the user out.
        await auth.api.signOut({ headers: await headers() });
        return {
          code: SessionCode.SessionInvalid,
          session: null,
          user: null,
          redirectTo: "/",
        };
      }

      // Fetch the user from the database or from cache.
      const user = await unwrap(getUserById(session.user.id));

      const result: SessionVerifiedResult = {
        code: SessionCode.Ok,
        session,
        user,
      };

      // Check if the user is banned.
      if (user.banned) {
        const routePath =
          nextHeaders.get("x-invoke-path")
          ?? nextHeaders.get("x-pathname")
          ?? nextHeaders.get("next-url")
          ?? readPathFromReferer(nextHeaders.get("referer"))
          ?? "/unknown";

        // Best-effort method for server component and route-handler contexts.
        const method =
          nextHeaders.get("x-http-method-override")
          ?? nextHeaders.get(":method")
          ?? "GET";

        void logBannedAccessAttempt({
          actorUserId: user.id,
          actorRole: user.role,
          routePath,
          httpMethod: method,
          source: "session.verify",
        });

        result.code = SessionCode.Banned;
        result.redirectTo = "/error/banned";
      }

      // Otherwise, check the required roles specified
      if (utils.isExisty(role)) {
        if (role !== user.role) {
          result.code = SessionCode.InsufficientPermissions;
          result.redirectTo = "/dashboard";
        }
      }

      return result;
    } catch (e) {
      Sentry.captureException(e);

      // Log the user out.
      await auth.api.signOut({ headers: nextHeaders });
      return {
        code: SessionCode.SessionInvalid,
        session: null,
        user: null,
        redirectTo: "/",
      };
    }
  },
};

type SessionType = Awaited<ReturnType<typeof auth.api.getSession>>;

export type SessionVerifiedResult = {
  session: SessionType | null;
  user: User | null;
  redirectTo?: string;
  code: SessionCode;
}

export enum SessionCode {
  Ok = 0,
  Pending = 1,
  Banned = 2,
  ShadowBanned = 3,
  InsufficientPermissions = 4,
  SessionInvalid = 5,
}

function readPathFromReferer(referer: string | null): string | null {
  if (!referer) {
    return null;
  }

  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
