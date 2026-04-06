import "dotenv/config";

import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { invitations, user } from "@/lib/db/schema";
import * as utils from "@/scripts/utils.mjs";

async function generateSetupToken() {
  console.log("Creating a invitation token...");
  const token = utils.token.generatePassword(32);
  const validity = DateTime.now().plus({ hours: 1 }).toJSDate();

  // Detect if admin user is already present
  const [adminUser] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, "admin@jippy.local"))
    .limit(1);
  if (adminUser) {
    console.error("User is already been created. No need to make a new account.");
    process.exit(1);
  }

  await db.insert(invitations).values({
    token,
    role: "administrator_user",
    validUntil: validity,
    consumed: false,
    email: "admin@jippy.local",
  });

  console.log("Your invitation is generated.");
  console.log("");
  console.log("  Invitiation URL: %s", `${process.env.BETTER_AUTH_URL}/signup/?token=${token}`);
  console.log("  Email: admin@jippy.local");
  console.log("");
}

generateSetupToken().catch(console.error);
