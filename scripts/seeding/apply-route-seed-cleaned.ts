import "dotenv/config";

import { eq } from "drizzle-orm";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import {addRoute, AddRouteParameters} from "@/lib/management/route-manager";
import { unwrap } from "@/lib/one-of";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

const jsonPath = path.join(__dirname, "cleaned-data.json");
if (!fs.existsSync(jsonPath)) {
  throw new Error("No such file found: '" + jsonPath + "'");
}

async function main() {
  const data = await fsp.readFile(jsonPath, "utf-8");
  const routes: CleanedDataType = JSON.parse(data);

  // Fetch the user account
  const [adminUser] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, "admin@jippy.local"))
    .limit(1);
  if (!adminUser) {
    console.error("Admin user cannot be found! Are you sure did you setup the administrator account?");
    process.exit(1);
  }

  for (const route of routes.data.routes) {
    console.log("inserting: %s - %s", route.routeNumber, route.routeName);

    try {
      const goingToPolyline = route.points.polylineGoingTo;
      const goingBackPolyline = route.points.polylineGoingBack;

      const goingToMapped = route.points.goingTo.map(x => ({
        sequence: Number(x.sequence),
        address: x.address,
        point: x.point,
      }));
      const goingBackMapped = route.points.goingBack.map(x => ({
        sequence: Number(x.sequence),
        address: x.address,
        point: x.point,
      }));

      const routePayload: AddRouteParameters = {
        snapshotName: "v1",
        snapshotState: "ready",
        routeNumber: route.routeNumber,
        routeName: route.routeName,
        routeColor: route.routeColor,
        routeDetails: "Seeded, needed to be filled",
        vehicleTypeId: "00000000-0000-7000-8000-000000000001",
        polylineGoingTo: goingToPolyline,
        polylineGoingBack: goingBackPolyline,
        points: {
          goingTo: goingToMapped
            .toSorted((a, b) => a.sequence - b.sequence),
          goingBack: goingBackMapped
            .toSorted((a, b) => a.sequence - b.sequence),
        },
      };

      await unwrap(addRoute(routePayload, adminUser.id));
    } catch (e) {
      console.warn(`Failed for route ${route.routeNumber}:`, e);
    }
  }
}

main().catch(console.error);

type CleanedDataType = {
  ok: boolean;
  data: {
    routes: Array<{
      id: string;
      routeNumber: string;
      routeName: string;
      routeColor: string;
      routeDetails: string;
      availableFrom: string;
      availableTo: string;
      vehicleTypeId: string;
      vehicleName: string;
      points: {
        polylineGoingTo: string;
        goingTo: Array<{
          id: string;
          sequence: string;
          address: string;
          point: [number, number];
        }>
        polylineGoingBack: string;
        goingBack: Array<{
          id: string;
          sequence: string;
          address: string;
          point: [number, number];
        }>
      }
    }>
  }
}
