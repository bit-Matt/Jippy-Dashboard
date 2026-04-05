import "dotenv/config";

import { addRoute } from "@/lib/management/route-manager";
import { getRoutePolyline } from "@/lib/osm/valhalla";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const jsonPath = path.join(__dirname, "route-seed-data.json");
if (!fs.existsSync(jsonPath)) {
  throw new Error("No such file found: '" + jsonPath + "'");
}

const COLORS = [
  "#fff100",
  "#ff8c00",
  "#e81123",
  "#ec008c",
  "#68217a",
  "#00188f",
  "#00bcf2",
  "#00b294",
  "#009e49",
  "#bad80a",
];

async function map<T, K>(data: T[], fn: (item: T, index: number, array: T[]) => Promise<K>): Promise<K[]> {
  const result: K[] = [];

  for (let i = 0; i < data.length; i++) {
    const mapped = await fn(data[i], i, data);
    result.push(mapped);
  }

  return result;
}

async function main() {
  const data = await fsp.readFile(jsonPath, "utf-8");
  const routes: Route[] = JSON.parse(data);

  for (const route of routes) {
    console.log("inserting: %s - %s", route.route_id, route.route_short_name);

    const shapes = route.shapes.map(s => ({
      ...s,
      shape_pt_lat: Number(s.shape_pt_lat),
      shape_pt_lon: Number(s.shape_pt_lon),
      shape_pt_sequence: Number(s.shape_pt_sequence),
    }));

    const goingTo = shapes.filter(s => s.shape_direction === "1");
    const goingBack = shapes.filter(s => s.shape_direction === "2");

    try {
      // FIX: Added 'await' assuming getRoutePolyline is an async API call
      const goingToPolyline = await getRoutePolyline(
        goingTo.map(x => ({
          sequence: x.shape_pt_sequence,
          point: [x.shape_pt_lat, x.shape_pt_lon] as [number, number],
        })).toSorted((a, b) => a.sequence - b.sequence),
      );

      const goingBackPolyline = await getRoutePolyline(
        goingBack.map(x => ({
          sequence: x.shape_pt_sequence,
          point: [x.shape_pt_lat, x.shape_pt_lon] as [number, number],
        })).toSorted((a, b) => a.sequence - b.sequence),
      );

      const goingToMapped = await map(goingTo, async (s) => {
        console.log("--> reversing %s - %d", s.shape_id, s.shape_pt_sequence);

        const url = new URL("/reverse", process.env.NEXT_PUBLIC_NOMINATIM_URL);
        url.searchParams.append("format", "jsonv2");
        url.searchParams.append("lat", String(s.shape_pt_lat));
        url.searchParams.append("lon", String(s.shape_pt_lon));

        const response = await fetch(url.toString(), {
          method: "GET",
          // FIX: Added required User-Agent to prevent Nominatim from blocking the request
          headers: {
            "User-Agent": "RouteSeederApp/1.0 (contact@yourdomain.com)",
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch mapped url: ${response.statusText}`);
        }

        const data = await response.json();

        return {
          sequence: s.shape_pt_sequence,
          address: data.display_name as string,
          point: [s.shape_pt_lat, s.shape_pt_lon] as [number, number],
        };
      });

      const goingBackMapped = await map(goingBack, async (s) => {
        console.log("--> reversing %s - %d", s.shape_id, s.shape_pt_sequence);

        const url = new URL("/reverse", process.env.NEXT_PUBLIC_NOMINATIM_URL);
        url.searchParams.append("format", "jsonv2");
        url.searchParams.append("lat", String(s.shape_pt_lat));
        url.searchParams.append("lon", String(s.shape_pt_lon));

        const response = await fetch(url.toString(), {
          method: "GET",
          // FIX: Added required User-Agent
          headers: {
            "User-Agent": "RouteSeederApp/1.0 (contact@yourdomain.com)",
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch mapped url: ${response.statusText}`);
        }

        const data = await response.json();

        return {
          sequence: s.shape_pt_sequence,
          address: data.display_name as string,
          point: [s.shape_pt_lat, s.shape_pt_lon] as [number, number],
        };
      });

      const routePayload = {
        snapshotName: "v1",
        snapshotState: "ready",
        routeNumber: route.route_id,
        routeName: route.route_long_name,
        // FIX: Multiplied instead of subtracted to get a valid random index
        routeColor: COLORS[Math.floor(Math.random() * COLORS.length)],
        routeDetails: "Seeded, needed to be filled",
        polylineGoingTo: goingToPolyline,
        polylineGoingBack: goingBackPolyline,
        points: {
          goingTo: goingToMapped.toSorted((a, b) => a.sequence - b.sequence),
          goingBack: goingBackMapped.toSorted((a, b) => a.sequence - b.sequence),
        },
      };

      /* eslint-disable-next-line */
      await addRoute(routePayload as any);
    } catch (e) {
      console.warn(`Failed for route ${route.route_id}:`, e);
    }
  }
}

main().catch(console.error);

type Route = {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_desc: string;
  route_type: string;
  route_url: string;
  route_text_color: string;
  route_sort_order: string;
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
  }>;
}
