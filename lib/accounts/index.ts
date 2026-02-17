"use server";

import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";
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
 * Retrieves a user by their unique identifier.
 *
 * @param {string} id - The unique identifier of the user to retrieve.
 * @return {Promise<Success|Failure>} A promise that resolves to a Success object containing the user details
 *                                    if found, or a Failure object indicating the error.
 */
export async function getUser(id: string) {
  try {
    const [result] = await db
      .select({
        fullName: user.name,
        email: user.email,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!result) {
      return new Failure(FailureCodes.UserNotFound, "User not found!");
    }

    return new Success(result);
  } catch {
    return new Failure(FailureCodes.Fatal, "Internal exception.");
  }
}

/**
 * Configures a new user on the server by creating an account using the provided user details.
 * If the server has already been configured, the operation is aborted.
 *
 * @param {UserCredentials} user The user object containing the full name, email, and password for registration.
 * @return {Promise<ServerActionResult<undefined>>} A promise resolving to the result of the configuration attempt.
 * The result includes a success flag (`ok`) and an optional message in case of failure.
 */
export async function configureUser(user: UserCredentials): Promise<ServerActionResult<undefined>> {
  const isConfigured = await isAlreadyConfigured();

  // Throw an exception when the server has already been configured.
  if (isConfigured) {
    return { ok: false, message: "Server is already configured." };
  }

  // Validation
  const validation = await validator.validate<UserCredentials>(user, {
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

export type UserCredentials = {
  fullName: string;
  email: string;
  password: string;
};
