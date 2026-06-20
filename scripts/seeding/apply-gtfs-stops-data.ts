import "dotenv/config";

import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";
import type * as GeoJSON from "@/lib/db/postgis-extension/geojsonTypes";
import { stops, user } from "@/lib/db/schema";

async function main() {
  const seedPath = path.join(__dirname, "gtfs-data", "stops.csv");
  const data = fs.readFileSync(seedPath, "utf-8");

  const [adminUser] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, "admin@jippy.local"))
    .limit(1);
  if (!adminUser) {
    throw new Error("Admin user cannot be found! Are you sure did you setup the administrator account?");
  }

  const lines = data.split(/\r?\n/)
    .map(x => x.split(","))
    .slice(1);

  for (let i = 0; i < lines.length; i++) {
    const [id, name, _, lat, lng] = lines[i];
    if (!id) continue;

    console.log(lat, lng);

    const url = new URL("/reverse", process.env.NOMINATIM_URL);
    url.searchParams.append("format", "jsonv2");
    url.searchParams.append("lat", String(lat));
    url.searchParams.append("lon", String(lng));

    const response = await fetch(url.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch mapped url: ${response.statusText}`);
    }

    const data = await response.json();

    await db.insert(stops)
      .values({
        number: i + 1,
        address: data.display_name as string,
        point: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        } satisfies GeoJSON.Point,
        isPublic: false,
        ownerId: adminUser.id,
      });

    console.log("Inserted: %s", id);
  }
}

main().catch(console.error);
