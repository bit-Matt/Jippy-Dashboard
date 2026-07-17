import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import type * as GeoJSON from "@/lib/db/postgis-extension/geojsonTypes";
import { stops, user } from "@/lib/db/schema";
import { haversineDistanceMeters, samplePolylineAtInterval } from "@/lib/map/geo";
import { decodePolyline } from "@/lib/map/polyline";
import { getAllRoutes, type RouteListItem } from "@/lib/management/route-manager";
import { unwrap } from "@/lib/one-of";

const INTERVAL_METERS = 200;
const DEDUP_THRESHOLD_METERS = 50;

type StopDirectionality = "direction_to" | "direction_back";

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const baseUrl = process.env.NOMINATIM_URL;
  if (!baseUrl) {
    return `${lat}, ${lon}`;
  }

  try {
    const url = new URL("/reverse", baseUrl.replace(/\/+$/, ""));
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      return `${lat}, ${lon}`;
    }

    const data = await res.json() as { display_name?: string };
    return data.display_name ?? `${lat}, ${lon}`;
  } catch {
    return `${lat}, ${lon}`;
  }
}

function isNearExisting(
  point: [number, number],
  existing: Array<[number, number]>,
  thresholdMeters: number,
): boolean {
  return existing.some(
    (other) => haversineDistanceMeters(point, other) < thresholdMeters,
  );
}

async function main() {
  const [adminUser] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, "admin@jippy.local"))
    .limit(1);

  if (!adminUser) {
    throw new Error(
      "Admin user cannot be found! Are you sure did you setup the administrator account?",
    );
  }

  const deleted = await db.delete(stops).returning({ id: stops.id });
  console.log("Wiped %d existing stop(s).", deleted.length);

  const routeList = (await unwrap(getAllRoutes(false))) as RouteListItem[];
  console.log("Sampling stops from %d route(s) every %dm.", routeList.length, INTERVAL_METERS);

  // Dedup only within the same directionality so opposite sides of a divided
  // road keep separate stops even when geographically < 50m apart.
  const createdPointsByDirection: Record<StopDirectionality, Array<[number, number]>> = {
    direction_to: [],
    direction_back: [],
  };
  let nextNumber = 1;
  let created = 0;
  let skipped = 0;

  const directions: Array<[StopDirectionality, "to" | "back"]> = [
    ["direction_to", "to"],
    ["direction_back", "back"],
  ];

  for (const route of routeList) {
    for (const [directionality, polylineKey] of directions) {
      const encoded = route.polylines[polylineKey];
      if (!encoded) {
        console.warn(
          "Skipping %s %s: empty polyline.",
          route.routeNumber,
          directionality,
        );
        continue;
      }

      const coordinates = decodePolyline(encoded);
      const samples = samplePolylineAtInterval(coordinates, INTERVAL_METERS);
      const createdPoints = createdPointsByDirection[directionality];

      for (const point of samples) {
        if (isNearExisting(point, createdPoints, DEDUP_THRESHOLD_METERS)) {
          skipped += 1;
          continue;
        }

        const [lat, lon] = point;
        const address = await reverseGeocode(lat, lon);

        await db.insert(stops).values({
          number: nextNumber,
          address,
          point: {
            type: "Point",
            coordinates: [lon, lat],
          } satisfies GeoJSON.Point,
          directionality,
          isPublic: true,
          ownerId: adminUser.id,
        });

        createdPoints.push(point);
        created += 1;
        console.log(
          "Inserted stop #%d (%s %s): %s",
          nextNumber,
          route.routeNumber,
          directionality,
          address,
        );
        nextNumber += 1;
      }
    }
  }

  console.log(
    "Done. Created %d stop(s), skipped %d near-duplicate(s).",
    created,
    skipped,
  );
}

main().catch(console.error);
