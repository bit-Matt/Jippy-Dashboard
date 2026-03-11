import "dotenv/config";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import * as nominatim from "@/lib/osm/nominatim";
import { routes, routeSequences } from "@/lib/db/schema";
import { oneOf } from "@/lib/oneOf";

async function main() {
  // Check if the seed file exists
  const seedFile = path.join(__dirname, "./route-seed-data.json");
  if (!fs.existsSync(seedFile)) {
    console.error("Seed file not found. Try running 'npm run db:seed_route' again.");
    process.exit(1);
  }

  // Read the file
  const file = await fsp.readFile(seedFile, { encoding: "utf-8" });

  // Parse the JSON data
  const data: Array<RouteSeedData> = JSON.parse(file);

  const COLORS = [
    "#fff100", "#ff8c00", "#e81123",
    "#ec008c", "#68217a", "#00188f",
    "#00bcf2", "#00b294", "#009e49",
    "#bad80a",
  ];

  for (const route of data) {
    // In case of empty route ID
    if (route.route_id === "") continue;

    const [newRoute] = await db
      .insert(routes)
      .values({
        routeNumber: route.route_short_name,
        routeName: route.route_long_name,
        routeColor: COLORS[Math.floor(Math.random() * COLORS.length)],
      })
      .returning();
    if (!newRoute) {
      console.error("Failed to insert route");
      process.exit(1);
    }

    const sequenceTo = route.shapes
      .filter(x => x.shape_direction === "2")
      .map(x => ({
        ...x,
        shape_pt_lat: Number(x.shape_pt_lat),
        shape_pt_lon: Number(x.shape_pt_lon),
        shape_pt_sequence: Number(x.shape_pt_sequence),
      }))
      .toSorted((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
    // const sequenceFrom = route.shapes
    //   .filter(x => x.shape_direction === "1")
    //   .map(x => ({
    //     ...x,
    //     shape_pt_lat: Number(x.shape_pt_lat),
    //     shape_pt_lon: Number(x.shape_pt_lon),
    //     shape_pt_sequence: Number(x.shape_pt_sequence) + sequenceTo.length,
    //   }))
    //   .toSorted((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);

    const sequences = sequenceTo
      .toSorted((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
    for (const sequence of sequences) {
      const addressQuery = await nominatim.reverse({
        lat: sequence.shape_pt_lat,
        lon: sequence.shape_pt_lon,
      });
      const address = oneOf(addressQuery).match(
        s => s,
        () => null,
      );
      if (!address) {
        console.error("Failed to resolve address");
        process.exit(1);
      }

      await db
        .insert(routeSequences)
        .values({
          routeId: newRoute.id,
          sequenceNumber: sequence.shape_pt_sequence,
          point: [sequence.shape_pt_lon, sequence.shape_pt_lat],
          address: address.display_name,
        });
    }

    console.log("Inserted: %s", route.route_long_name);
  }
}

main().catch(console.error);

type RouteSeedData = {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_desc: string;
  route_type: string;
  route_url: string;
  route_color: string;
  route_text_color: string;
  continuous_pickup: string;
  continuous_drop_off: string;
  shapes: Array<{
    shape_id: string;
    shape_pt_lat: string;
    shape_pt_lon: string;
    shape_pt_sequence: string;
    shape_dist_traveled: string;
    shape_direction: string;
    shape_route_id: string;
  }>
}
