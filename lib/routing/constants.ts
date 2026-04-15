// ---------------------------------------------------------------------------
// Routing algorithm tunable parameters
// ---------------------------------------------------------------------------

/** Multiplier applied to walking distance in cost calculations */
export const WALK_PENALTY_MULTIPLIER = 2.0;

/** Walking distance (meters) below which cost is linear; above this cost escalates quadratically */
export const WALK_COMFORT_METERS = 150;

/** Rate at which walk cost escalates beyond the comfort threshold (higher = steeper penalty) */
export const WALK_ESCALATION_RATE = 0.008;

/** Cost multiplier for transit (ride) edges. Values < 1 make riding cheaper than
 *  the equivalent walking distance, encouraging the algorithm to stay on transit
 *  and use transfers rather than exit early and walk long distances. */
export const TRANSIT_COST_FACTOR = 0.5;

/** Flat penalty (in meters-equivalent) added for each vehicle transfer */
export const TRANSFER_PENALTY_METERS = 120;

/** Multiplier applied to edges that intersect a road closure polygon */
export const CLOSURE_PENALTY_MULTIPLIER = 5.0;

/** Max distance (meters) between nodes on different routes to create a transfer edge.
 *  25m was too tight — polyline vertices from different routes at an intersection
 *  are often 30-100m apart. 100m captures real-world transfer opportunities. */
export const TRANSFER_PROXIMITY_METERS = 100;

/** If straight-line A→B distance is below this, return a pure walk route */
export const WALK_ONLY_THRESHOLD_METERS = 200;

/** If the nearest transit line/station is farther than this from A or B, return walk-only */
export const MAX_TRANSIT_PROXIMITY_METERS = 5_000;

/** Average walking speed in km/h */
export const WALK_SPEED_KMH = 4.25;

/** Average tricycle speed in km/h */
export const TRICYCLE_SPEED_KMH = 10;

/** Average jeepney speed in km/h */
export const JEEPNEY_SPEED_KMH = 10;

/** Maximum A* iterations before giving up (prevents runaway on malformed graphs) */
export const MAX_ASTAR_ITERATIONS = 50_000;

/** Virtual node ID for the user's start point */
export const VIRTUAL_START_ID = "__start__";

/** Virtual node ID for the user's destination point */
export const VIRTUAL_END_ID = "__end__";
