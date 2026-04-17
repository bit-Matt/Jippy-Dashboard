// ---------------------------------------------------------------------------
// Routing algorithm tunable parameters
// ---------------------------------------------------------------------------

/** Multiplier applied to walking distance in cost calculations */
export const WALK_PENALTY_MULTIPLIER = 2.0;

/** Walking distance (meters) below which cost is linear; above this cost escalates quadratically */
export const WALK_COMFORT_METERS = 150;

/** The rate at which walk cost escalates beyond the comfort threshold (higher = steeper penalty) */
export const WALK_ESCALATION_RATE = 0.008;

/** Cost multiplier for transit (ride) edges. Values < 1 make riding cheaper than
 *  the equivalent walking distance, encouraging the algorithm to stay on transit
 *  and use transfers rather than exit early and walk long distances. */
export const TRANSIT_COST_FACTOR = 0.5;

/** Flat penalty (in meters-equivalent) added for each vehicle transfer */
export const TRANSFER_PENALTY_METERS = 120;

/** Minimum transit ride distance (meters) that justifies boarding a vehicle.
 *  Segments shorter than this are dropped — the user should just walk instead. */
export const MIN_TRANSIT_RIDE_METERS = 300;

/** Multiplier applied to edges that intersect a road closure polygon */
export const CLOSURE_PENALTY_MULTIPLIER = 5.0;

/** Max distance (meters) between nodes on different routes to create a transfer edge.
 *  25m was too tight — polyline vertices from different routes at an intersection
 *  are often 30-100m apart. 100m captures real-world transfer opportunities. */
export const TRANSFER_PROXIMITY_METERS = 100;

/** If the straight-line A → B distance is below this, return a pure walk route */
export const WALK_ONLY_THRESHOLD_METERS = 200;

/** If the nearest transit line/station is farther than this from A or B, return walks-only */
export const MAX_TRANSIT_PROXIMITY_METERS = 5_000;

/** Average walking speed in km/h */
export const WALK_SPEED_KMH = 4.25;

/** Average tricycle speed in km/h */
export const TRICYCLE_SPEED_KMH = 10;

/** Average jeepney speed in km/h */
export const JEEPNEY_SPEED_KMH = 10;

/** Multiplier for fleet-based boarding cost: (roundTripDist / fleetCount) / 2 * this factor.
 *  Converts estimated wait time (in meters-of-route-covered) to a cost penalty.
 *  A low value keeps it as the lowest-priority factor after distance, walking, and transfers. */
export const BOARDING_COST_FACTOR = 0.25;

/** Maximum A* iterations before giving up (prevents runaway on malformed graphs) */
export const MAX_ASTAR_ITERATIONS = 50_000;

/** Virtual node ID for the user's start point */
export const VIRTUAL_START_ID = "__start__";

/** Virtual node ID for the user's destination point */
export const VIRTUAL_END_ID = "__end__";

// ---------------------------------------------------------------------------
// Weight profile presets
// ---------------------------------------------------------------------------

import type { WeightProfile } from "@/lib/routing/types";

const BASE_PROFILE: WeightProfile = {
  walkPenaltyMultiplier: WALK_PENALTY_MULTIPLIER,
  walkComfortMeters: WALK_COMFORT_METERS,
  walkEscalationRate: WALK_ESCALATION_RATE,
  transitCostFactor: TRANSIT_COST_FACTOR,
  transferPenaltyMeters: TRANSFER_PENALTY_METERS,
  boardingCostFactor: BOARDING_COST_FACTOR,
  closurePenaltyMultiplier: CLOSURE_PENALTY_MULTIPLIER,
};

/** Fastest: default balanced weights */
export const PROFILE_FASTEST: WeightProfile = { ...BASE_PROFILE };

/** Least Walking: high walk penalty forces transit/tricycle for short distances */
export const PROFILE_LEAST_WALKING: WeightProfile = {
  ...BASE_PROFILE,
  walkPenaltyMultiplier: 5.0,
  walkEscalationRate: 0.02,
};

/** Simplest: extremely high transfer penalty to prefer direct routes */
export const PROFILE_SIMPLEST: WeightProfile = {
  ...BASE_PROFILE,
  transferPenaltyMeters: 1800,
};

/** Explorer diversity penalty applied to fastest route's transit lines */
export const EXPLORER_DIVERSITY_PENALTY = 5.0;
/** Explorer: max vehicle transfers allowed */
export const EXPLORER_MAX_TRANSFERS = 2;
/** Explorer: max duration relative to fastest route */
export const EXPLORER_DURATION_CAP = 1.5;
