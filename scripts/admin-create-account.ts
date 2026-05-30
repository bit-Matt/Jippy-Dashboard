import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import * as utils from "@/scripts/utils.mjs";

async function createAdminAccount() {
  // Get the enroller user.
  const [enrollerUser] = await db
    .select({
      id: user.id,
    })
    .from(user)
    .where(
      and(
        eq(user.role, "administrator_user"),
      ),
    );
  if (enrollerUser) {
    console.error("Administrator account is already generated.");
    return;
  }

  // Create user
  const password = utils.token.generatePassword(16);
  const admin = await auth.api.signUpEmail({
    body: {
      name: "Jippy Administrator",
      email: "admin@jippy.local",
      password,
      role: "administrator_user",
    },
  });

  console.log("Your account has been generated.");
  console.log("");
  console.log("  Email:    admin@jippy.local");
  console.log("  Password: %s", password);
  console.log("  User ID:  %s", admin.user.id);
  console.log("");
  console.log("Your account credentials appear only once. Please take note of this.");

  await db.update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, admin.user.id));

  // Exit the process forcefully since redis will keep this running forever...
  return process.exit(0);
}

createAdminAccount().catch(console.error);
