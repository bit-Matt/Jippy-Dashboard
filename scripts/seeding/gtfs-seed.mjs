import fs from "node:fs";
import path from "node:path";

import * as utils from "../utils.mjs";

// __dirname polyfill because modules don't support this anymore
const __dirname = import.meta.dirname;

/**
 * @type {Array<{ route_id: string; agency_id: string; route_short_name: string; route_long_name: string; route_desc: string; route_type: string; route_url: string; route_color: string; route_text_color: string; route_sort_order: string; continuous_pickup: string; continuous_drop_off: string; shapes: Array<{ shape_id: string; shape_pt_lat: string; shape_pt_lon: string; shape_pt_sequence: string; shape_dist_traveled: string; shape_direction: string; shape_route_id: string; }> }>}
 */
const routes = await utils
  .csv
  .read(path.join(__dirname, "./gtfs-data/routes.csv"));

/**
 * @type {Array<{ shape_id: string; shape_pt_lat: string; shape_pt_lon: string; shape_pt_sequence: string; shape_dist_traveled: string; shape_direction: string; shape_route_id: string; }>}
 */
const shapes = await utils
  .csv
  .read(path.join(__dirname, "./gtfs-data/shapes.csv"));

// Fix data for easier mapping to routes
for (const shape of shapes) {
  const [routeId, direction] = shape.shape_id.split("_");
  shape.shape_direction = direction;
  shape.shape_route_id = routeId;

  if (utils.str.isEmpty(routeId) || utils.str.isEmpty(direction)) {
    continue;
  }
}

for (const route of routes) {
  route.shapes = shapes
    .filter(shape => shape.shape_route_id === route.route_id)
    .toSorted((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
}

const data = JSON.stringify(
  routes.filter(r => !utils.str.isEmpty(r.route_id)),
  null,
  2,
);

fs.writeFileSync(path.join(__dirname, "./route-seed-data.json"), data + "\n", "utf-8");
