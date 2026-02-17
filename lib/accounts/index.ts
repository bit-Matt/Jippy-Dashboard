"use server";

import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import type { ServerActionResult } from "@/lib/types";
import { user } from "@/lib/db/schema";
import { validator } from "@/lib/validator";

/**
 * Checks if there is an existing configuration by verifying
 * the presence of a user with an administrator role.
 *
 * @return {Promise<boolean>} A promise that resolves to a boolean indicating
 * whether an administrator user exists (true) or not (false).
 */
export async function isAlreadyConfigured(): Promise<boolean> {
  // Find a user with an administrator role
  const result = await db.select()
    .from(user)
    .where(eq(user.role, "administrator_user"))
    .limit(1);

  return result.length >= 1;
}

/**
 * Handles user sign-in by validating the provided credentials and then attempting authentication.
 *
 * @param {Credentials} credentials - An object containing the user's email, password, and rememberMe flag.
 * @param {string} credentials.email - The user's email address.
 * @param {string} credentials.password - The user's password.
 * @param {boolean} credentials.rememberMe - Whether the user wants to be remembered on the device.
 * @return {Promise<ServerActionResult<undefined>>} A promise that resolves to a result object indicating
 * whether the sign-in was successful or not. If unsuccessful, an error message will be provided.
 */
export async function signIn(credentials: Credentials): Promise<ServerActionResult<undefined>> {
  const validation = await validator.validate<Credentials>(credentials, {
    properties: {
      email: {
        type: "string",
        formatter: "email",
      },
      password: {
        type: "string",
        formatter: "non-empty-string",
      },
      rememberMe: {
        type: "boolean",
      },
    },
    requiredProperties: ["email", "password", "rememberMe"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return { ok: false, message: validator.toPlainErrors(validation.errors) };
  }

  // Authenticate
  try {
    await auth.api.signInEmail({
      body: {
        email: credentials.email,
        password: credentials.password,
        rememberMe: credentials.rememberMe,
      },
    });

    return { ok: true };
  } catch {
    return { ok: false, message: "Invalid email or password." };
  }
}

export async function signOut() {
  await auth.api.signOut({
    headers: await headers(),
  });
}

/**
 * Configures a new user on the server by creating an account using the provided user details.
 * If the server has already been configured, the operation is aborted.
 *
 * @param {User} user The user object containing the full name, email, and password for registration.
 * @return {Promise<ServerActionResult<undefined>>} A promise resolving to the result of the configuration attempt.
 * The result includes a success flag (`ok`) and an optional message in case of failure.
 */
export async function configureUser(user: User): Promise<ServerActionResult<undefined>> {
  const isConfigured = await isAlreadyConfigured();

  // Throw an exception when the server has already been configured.
  if (isConfigured) {
    return { ok: false, message: "Server is already configured." };
  }

  // Validation
  const validation = await validator.validate<User>(user, {
    properties: {
      fullName: {
        type: "string",
        formatter: "non-empty-string",
      },
      email: {
        type: "string",
        formatter: "email",
      },
      password: {
        type: "string",
        formatter: "strong-password",
      },
    },
    requiredProperties: ["fullName", "email", "password"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return { ok: false, message: validator.toPlainErrors(validation.errors) };
  }

  try {
    await auth.api.signUpEmail({
      body: {
        name: user.fullName,
        email: user.email,
        password: user.password,
      },
    });

    return { ok: true };
  } catch {
    return { ok: false, message: "Failed to create account." };
  }
}

export type Credentials = {
  email: string;
  password: string;
  rememberMe: boolean;
}

export type User = {
  fullName: string;
  email: string;
  password: string;
};
