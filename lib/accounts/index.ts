import { and, eq, gt } from "drizzle-orm";
import crypto from "node:crypto";
import { DateTime } from "luxon";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";
import { InvitationEmailHtml } from "@/lib/mailer/templates/InvitationMail";
import * as mailer from "@/lib/mailer";
import { unwrap } from "@/lib/one-of";
import { accessToken, invitations, user } from "@/lib/db/schema";
import { utils } from "@/lib/validator";
import { string } from "zod";
import { permanentRedirect } from "next/navigation";
import { permission } from "node:process";

/**
 * Retrieves a user by their unique identifier.
 *
 * @param {string} id - The unique identifier of the user to retrieve.
 * @return {Promise<Success|Failure>} A promise that resolves to a Success object containing the user details
 *                                    if found, or a Failure object indicating the error.
 */
export async function getUserById(id: string): Promise<Result<User>> {
  if (!utils.isExisty(id)) {
    return new Failure(ErrorCodes.ValidationFailure, "User ID is required.", { id });
  }

  try {
    const [account] = await db
      .select({
        id: user.id,
        fullName: user.name,
        email: user.email,
        activated: user.emailVerified,
        banned: user.banned,
        createdAt: user.createdAt,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!account) {
      return new Failure(ErrorCodes.ResourceNotFound, "User not found!");
    }

    const payload: User = {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      activated: account.activated,
      banned: account.banned,
      registrationDate: DateTime
        .fromJSDate(account.createdAt)
        .toFormat("MM/dd/yyyy HH:mm"),
      role: account.role,
    };

    return new Success(payload);
  } catch {
    return new Failure(ErrorCodes.Fatal, "Internal exception.");
  }
}

/**
 * Enrolls a user using an invitation/eligibility token and the provided enrollment requirements.
 *
 * Workflow:
 * 1) Verifies eligibility via the token (throws if eligibility lookup fails unexpectedly).
 * 2) Validates that the provided email matches the invitation email.
 * 3) Ensures the requested office position exists and belongs to the same office as the invitation.
 * 4) Creates the user account via email sign-up.
 * 5) Marks the invitation token as consumed.
 *
 * @param {EnrollmentRequirements} payload Enrollment details (token, email, password, etc.).
 * @returns {Promise<Result<{ ok: true }>>} A {@link Success} with `{ ok: true }` on success, or a {@link Failure} on
 *                                          validation/resource/fatal errors.
 *
 * @example
 * const res = await enroll(payload); // res are Success<{ ok: true }> or Failure
 */
export async function enroll(payload: EnrollmentRequirements): Promise<Result<{ ok: true }>> {
  try {
    // Check eligibility.
    const result = await unwrap(getEligibility(payload.token));

    await auth.api.signUpEmail({
      body: {
        name: payload.fullName,
        email: result.email,
        password: payload.password,
        role: result.role,
      },
    });

    // After enrollment, we need to consume the token.
    await db.update(invitations).set({ consumed: true }).where(eq(invitations.id, result.id));

    return new Success({ ok: true });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during enrollment.", {
      payload,
    }, e);
  }
}

/**
 * Validates and resolves an invitation token to determine whether enrollment is allowed.
 *
 * Performs:
 * - Basic validation that the token is present.
 * - Lookup of the invitation by token.
 * - Expiration and "already consumed" checks.
 *
 * @param {string} token Invitation token to validate.
 * @returns {Promise<Result<EligibilityResult>} A {@link Success} containing invitation and role context or
 *                                              a {@link Failure} describing why the token is
 *                                              invalid/expired/consumed/not found.
 *
 * @example
 * const res = await getEligibility(token); // res are Success<EligibilityResult> or Failure
 */
export async function getEligibility(token: string): Promise<Result<EligibilityResult>> {
  const check = utils.isNonEmpty(token);
  if (!check) {
    return new Failure(ErrorCodes.ValidationFailure, "Token is required.", {
      token,
    });
  }

  // Detect the token from the database
  const [invitation] = await db
    .select({
      id: invitations.id,
      token: invitations.token,
      validUntil: invitations.validUntil,
      consumed: invitations.consumed,
      role: invitations.role,
      email: invitations.email,
    })
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);
  if (!invitation) {
    return new Failure(ErrorCodes.ResourceNotFound, "No such token found.");
  }

  const now = DateTime.utc().toJSDate();
  if (invitation.validUntil < now) {
    return new Failure(ErrorCodes.ResourceExpired, "Token has expired.", {
      token,
      invitation,
      now,
    });
  }

  if (invitation.consumed) {
    return new Failure(ErrorCodes.ResourceExpired, "Token has already been consumed.", {
      invitation,
    });
  }

  return new Success({
    id: invitation.id,
    token: invitation.token,
    role: invitation.role,
    email: invitation.email,
  });
}

/**
 * Creates and persists a new invitation for a user to join an office, then attempts to email the invitation link.
 *
 * Validates the input `email` and `officeId`, ensures the target office exists, generates a time-limited token,
 * inserts the invitation record, and sends an email containing the enrollment URL and expiration time.
 *
 * @param email - Recipient email address. Must be a valid email format.
 * @param officeId - Target office identifier. Must be a valid UUID.
 * @returns A `Result` containing the created invitation payload on success, or a failure describing why it could not be
 *          created.
 *
 * @remarks
 * - Invitation tokens expire 24 hours after creation.
 * - Email send failures are returned as part of the success payload (when the DB insert succeeds), rather than failing
 *   the whole operation.
 * - Unexpected errors are wrapped in a fatal failure result.
 */
export async function createNewInvitation(email: string): Promise<Result<SentInvitation>> {
  try {
    if (!utils.isEmail(email)) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid email or office ID.", { email });
    }

    // Check if that user with that email is already invited before.
    const [existingInvitation] = await db
      .select({
        id: invitations.id,
      })
      .from(invitations)
      .where(eq(invitations.email, email.toLowerCase()))
      .limit(1);
    if (existingInvitation) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "You cannot create an invitation for an existing user.",
      );
    }

    // Check if the user with that email is already registered.
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (existingUser) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "You cannot create an invitation for an existing user.",
      );
    }

    // Issue a new invitation.
    const token = generateInvitationToken();

    // Expire the token after 24 hours.
    const expiresAt = DateTime.utc().plus({ hours: 24 }).toJSDate();

    // Create the entry
    const [result] = await db
      .insert(invitations)
      .values({
        email,
        token,
        role: "regular_user",
        validUntil: expiresAt,
      })
      .returning();

    // Send the email to the user.
    const { error } = await mailer.send({
      to: [result.email],
      subject: "Invitation to Join Jippy as Collaborator",
      html: InvitationEmailHtml({
        inviteUrl: `/signup/?token=${token}`,
        expiresAt: DateTime
          .fromJSDate(expiresAt, { zone: "UTC" })
          .setZone("Asia/Manila")
          .toFormat("MM/dd/yyyy HH:mm"),
        role: "Collaborator",
      }),
    });

    // Report to sentry...
    if (error) {
      Sentry.logger.error("Failed to send an email. See info.", error);
    }

    return new Success({
      id: result.id,
      email: result.email,
      role: result.role,
      ...(error
        ? { errors: { message: "Failed to send the email. This issue has been reported." } }
        : {}
      ),
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create a new invitation due to an unexpected error", {}, e);
  }
}

/**
 * Re-sends an existing invitation email for the specified invitation record.
 *
 * Loads the invitation details (recipient email, token, and expiration timestamp) and sends a fresh email
 * containing the enrollment URL and the formatted expiry time. Email delivery errors are logged and surfaced
 * in the success payload rather than failing the entire operation.
 *
 * @param id - The invitation identifier whose email should be re-sent.
 * @returns A `Result` containing `{ ok: true }` on success. If email delivery fails, `errors` is included in the success payload.
 *
 * @remarks
 * - If the invitation does not exist, this returns a resource-not-found failure.
 * - Email provider failures are logged for observability and returned as a non-fatal `errors` field.
 * - This does not create a new token or extend expiration; it reuses the existing token and validity window.
 */
export async function resendInvitation(id: string): Promise<Result<{ ok: boolean, email: string, errors?: object }>> {
  try {
    const [result] = await db
      .select({
        email: invitations.email,
        token: invitations.token,
        role: invitations.role,
        validUntil: invitations.validUntil,
      })
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1);
    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "Invitation not found.");
    }

    // Send the email to the user.
    const { error } = await mailer.send({
      to: [result.email],
      subject: `Invitation to Join ${process.env.NEXT_PUBLIC_PROJECT_ORG_NAME}`,
      html: InvitationEmailHtml({
        inviteUrl: `/enrollment/?token=${result.token}`,
        expiresAt: DateTime
          .fromJSDate(result.validUntil, { zone: "UTC" })
          .setZone("Asia/Manila")
          .toFormat("MM/dd/yyyy HH:mm"),
        role: result.role === "administrator_user" ? "Root User" : "Collaborator",
      }),
    });

    // Report to sentry...
    if (error) {
      Sentry.logger.error("Failed to send an email. See info.", error);
    }

    return new Success({
      ok: true,
      email: result.email,
      ...(error ? { errors: { message: "Failed to send the email. This issue has been reported." } } : {}),
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to resend invitation due to an unexpected error", {}, e);
  }
}

/**
 * Fetches all currently active (unconsumed) invitations, enriched with office details when available.
 *
 * Uses the project’s one-of result pattern:
 * - {@link Success} contains an array of {@link Invitation} records on success.
 * - {@link Failure} is returned if an unexpected error occurs while querying invitations.
 *
 * Notes:
 * - “Active” means the invitation has not been consumed yet.
 * - Office data is joined with a left join, so office fields may be missing if the referenced office
 *   record is absent or not linked.
 *
 * @returns {Promise<Result<Array<Invitation>>>}
 * A {@link Success} wrapping the list of active invitations, or a {@link Failure} with a fatal error code.
 *
 * @example
 * const res = await getActiveInvitations();
 * if (res instanceof Success) {
 *   for (const invite of res.value) {
 *     console.log(invite.email, invite.officeName);
 *   }
 * } else {
 *   console.error(res.message);
 * }
 */
export async function getActiveInvitations(): Promise<Result<Array<Invitation>>> {
  try {
    const now = DateTime.utc().toJSDate();

    const list = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.consumed, false),
          gt(invitations.validUntil, now),
        ),
      );

    return new Success(list as Array<Invitation>);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during invitations lookup.", {}, e);
  }
}

/**
 * Revokes (deletes) an invitation by its identifier.
 *
 * Looks up the invitation first to provide a clear "not found" failure when the id does not exist,
 * then deletes the invitation record and returns a success result.
 *
 * @param id - The invitation identifier to revoke.
 * @returns A `Success<{ id: string; email: string }>` when the invitation is revoked, or a `Failure` when the invitation does not exist or an unexpected error occurs.
 *
 * @remarks
 * - If the invitation is missing, this returns a resource-not-found failure.
 * - Any unexpected exception is wrapped as a fatal failure and includes the `id` in the error metadata.
 */
export async function revokeInvitation(id: string): Promise<Success<{ id: string; email: string }> | Failure> {
  try {
    const [invitation] = await db
      .select({
        id: invitations.id,
        email: invitations.email,
      })
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1);

    if (!invitation) {
      return new Failure(ErrorCodes.ResourceNotFound, "Invitation not found.");
    }

    // Delete entry
    await db.delete(invitations).where(eq(invitations.id, id));

    return new Success({
      id: invitation.id,
      email: invitation.email,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during invitation revocation.", { id }, e);
  }
}

export async function createAccessToken(userId: string, permission: "r" | "rw"): Promise<Result<AccessToken>> {
  try {
    const token = crypto.createHash("sha512")
      .update(crypto.randomBytes(2048))
      .digest();

    const [userSelected] = await db
      .select({ id: user.id, fullName: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!userSelected) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such user found", { userId });
    }

    const [result] = await db
      .insert(accessToken)
      .values({
        accessToken: `jp_${token}`,
        permissions: permission,
        ownerId: userSelected.id,
      })
      .returning();
    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Unable to create an access token", { userId, permission });
    }

    return new Success({
      id: result.id,
      accessToken: result.accessToken,
      permission: result.permissions,
      owner: {
        id: userSelected.id,
        fullName: userSelected.fullName,
        email: userSelected.email,
      },
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create access token", { userId, permission }, e);
  }
}

export async function revokeAccessToken(userId: string, tokenId: string): Promise<Result<string>> {
  try {
    const [userSelected] = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!userSelected) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such user found", { userId });
    }

    const [result] = await db
      .select({ id: accessToken.id, ownerId: accessToken.ownerId })
      .from(accessToken)
      .where(eq(accessToken.id, tokenId))
      .limit(1);
    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such token found", { userId, tokenId });
    }

    // Only delete if the user is a root user or the owner of the token
    if (userSelected.role === "administrator_user" || userSelected.id === result.ownerId) {
      await db.delete(accessToken).where(eq(accessToken.id, result.id));
      return new Success(result.id);
    }

    return new Failure(ErrorCodes.ResourceNotFound, "No such token found", { userId, tokenId });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to revoke access token", { userId, tokenId }, e);
  }
}

export async function getAllAccessToken(userId: string, asRoot?: boolean) {
  try {
    const [userSelected] = await db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!userSelected) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such user found.", { userId });
    }

    // Check if asRoot is specified
    if (asRoot && userSelected.role !== "administrator_user") {
      return new Failure(ErrorCodes.ValidationFailure, "User does not met the criteria", { userId, asRoot });
    }

    if (asRoot) {
      const list = await db
        .select({
          id: accessToken.id,
          accessToken: accessToken.accessToken,
          permission: accessToken.permissions,
          ownerId: user.id,
          ownerFullName: user.name,
          ownerEmail: user.email,
        })
        .from(accessToken)
        .leftJoin(user, eq(accessToken.ownerId, user.id));

      const result: AccessToken[] = list.map(t => ({
        id: t.id,
        accessToken: t.accessToken.substring(0, 8),
        permission: t.permission!,
        owner: {
          id: t.ownerId!,
          fullName: t.ownerFullName!,
          email: t.ownerEmail!,
        },
      }));

      return new Success(result);
    }

    const list = await db
      .select({
        id: accessToken.id,
        accessToken: accessToken.accessToken,
        permission: accessToken.permissions,
      })
      .from(accessToken);

    const result: AccessToken[] = list.map(t => ({
      id: t.id,
      accessToken: t.accessToken.substring(0, 8),
      permission: t.permission!,
      owner: {
        id: userSelected.id,
        fullName: userSelected.name,
        email: userSelected.email,
      },
    }));

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch all access tokens", { userId, asRoot }, e);
  }
}

export async function getTokenById(token: string): Promise<Result<AccessTokenInfo>> {
  try {
    const [selectedToken] = await db
      .select({
        id: accessToken.id,
        permission: accessToken.permissions,
        ownerId: user.id,
        ownerFullName: user.name,
        ownerEmail: user.email,
      })
      .from(accessToken)
      .where(eq(accessToken.accessToken, token))
      .leftJoin(user, eq(user.id, accessToken.ownerId))
      .limit(1);
    if (!selectedToken) {
      return new Failure(ErrorCodes.ResourceNotFound, "Invalid token", { token });
    }

    return new Success({
      id: selectedToken.id,
      permission: selectedToken.permission!,
      owner: {
        id: selectedToken.ownerId!,
        fullName: selectedToken.ownerFullName!,
        email: selectedToken.ownerEmail!,
      },
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch token", { token }, e);
  }
}

/**
 * Generates an invitation token suitable for use as a one-time code.
 *
 * The token is built from a fixed number of cryptographically-random bytes, composed of a mix of
 * lowercase letters, uppercase letters, and digits. The counts of each character class are derived
 * from random values and then the resulting bytes are shuffled to avoid predictable grouping.
 *
 * Security notes:
 * - Uses cryptographically secure randomness.
 * - Returns an ASCII string with a fixed length.
 * - Treat as a secret; store/transport it accordingly (e.g., hash at rest if appropriate).
 *
 * @returns {string} A fixed-length ASCII invitation token containing lowercase letters, uppercase letters, and digits
 *                   in randomized order.
 */
function generateInvitationToken(): string {
  // Allocate 32 bytes of memory for token
  const bytes = Buffer.alloc(128);

  // Number generation
  const r32 = () => crypto.randomInt(8, 1 << 5);

  let a = r32();
  let b = r32();

  let point = 0;

  // Generate
  a = (a ^ (a >> 3)) & 63;
  for (let ai = 0; ai < a; ai++) {
    bytes[point] = crypto.randomInt(0x61, 0x7b);
    point++;
  }

  b = (b ^ (b >> 3)) & 63;
  for (let bi = 0; bi < b; bi++) {
    bytes[point] = crypto.randomInt(0x41, 0x5b);
    point++;
  }

  const c = (128 - ((a + b) << 0)) >> 0;
  for (let ci = 0; ci < c; ci++) {
    bytes[point] = crypto.randomInt(0x30, 0x3a);
    point++;
  }

  // Shuffle bytes
  const random = new Uint8Array(128);
  crypto.getRandomValues(random);

  for (let i = bytes.length - 1; i > 0; i--) {
    // 0 <= j <= i
    const j = crypto.randomInt(0, i + 1);

    // Swap elements
    [bytes[i], bytes[j]] = [bytes[j], bytes[i]];
  }

  // Produce final string
  return Buffer.from(bytes).toString("ascii");
}

export type User = {
  id: string;
  fullName: string;
  email: string;
  activated: boolean;
  banned: boolean;
  registrationDate: string;
  role: string;
}

export type EnrollmentRequirements = {
  fullName: string;
  password: string;
  token: string;
}

export type EligibilityResult = {
  id: string;
  token: string;
  role: string;
  email: string;
}

export type UserCredentials = {
  fullName: string;
  password: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
}

export type SentInvitation = {
  errors?: object
} & Invitation;

export type AccessToken = {
  id: string;
  accessToken: string;
  permission: string;
  owner: {
    id: string;
    fullName: string;
    email: string;
  }
}

export type AccessTokenInfo = Omit<AccessToken, "accessToken">;
