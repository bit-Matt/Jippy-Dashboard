import "dotenv/config";

import { DateTime } from "luxon";
import { faker } from "@faker-js/faker";

import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import * as utils from "@/scripts/utils.mjs";

async function generateSetupToken() {
  console.log("Creating a invitation token...");
  const token = utils.token.generatePassword(32);
  const validity = DateTime.utc().plus({ days: 1 }).toJSDate();
  const email = faker.internet.email().toLowerCase();

  await db.insert(invitations).values({
    token,
    role: "administrator_user",
    validUntil: validity,
    consumed: false,
    email,
  });

  console.log("Your invitation is generated.");
  console.log("");
  console.log("  Invitiation URL: %s", `${process.env.BETTER_AUTH_URL}/signup/?token=${token}`);
  console.log("  Email: %s", email);
  console.log("");
  console.log("For the sake of security, please only do this once.");
}

generateSetupToken().catch(console.error);
