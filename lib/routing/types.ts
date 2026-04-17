// ---------------------------------------------------------------------------
// Routing algorithm type definitions
// ---------------------------------------------------------------------------

/** A lat/lng coordinate pair [latitude, longitude] */
export type LatLng = [number, number];

// -- Graph types ------------------------------------------------------------

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  routeId: string;
  routeName: string;
  routeColor: string;
  direction: "goingTo" | "goingBack";
  polylineIndex: number;
}

export type EdgeType = "transit" | "transfer" | "walk";

export interface GraphEdge {
  from: string;
  to: string;
  distance: number;
  cost: number;
  type: EdgeType;
  routeId?: string;
  routeName?: string;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  /** Adjacency list: nodeId → outgoing edges */
  edges: Map<string, GraphEdge[]>;
}

// -- Path reconstruction ----------------------------------------------------

export interface PathSegment {
  routeId: string;
  direction: "goingTo" | "goingBack";
  routeName: string;
  routeColor: string;
  nodes: GraphNode[];
}

// -- Transit data loaded from DB --------------------------------------------

export interface TransitRoute {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  fleetCount: number;
  polylines: { to: string; back: string };
  decodedGoingTo: LatLng[];
  decodedGoingBack: LatLng[];
}

export interface TransitRegion {
  id: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: { id: string; sequence: number; point: LatLng }[];
  stations: TransitStation[];
}

export interface TransitStation {
  id: string;
  address: string;
  availableFrom: string;
  availableTo: string;
  point: LatLng;
}

export interface TransitClosure {
  id: string;
  closureName: string;
  points: { id: string; sequence: number; point: LatLng }[];
}

export interface TransitData {
  routes: TransitRoute[];
  regions: TransitRegion[];
  closures: TransitClosure[];
}

// -- Instruction types ------------------------------------------------------

export type ManeuverType =
  | "depart"
  | "turn"
  | "board"
  | "alight"
  | "transfer"
  | "arrive";

export interface Instruction {
  text: string;
  maneuver_type: ManeuverType;
}

// -- Leg / response types ---------------------------------------------------

export type LegType = "WALK" | "TRICYCLE" | "JEEPNEY";

export interface RouteLeg {
  type: LegType;
  route_name: string | null;
  polyline: string;
  color: string | null;
  distance: number;
  duration: number;
  instructions: Instruction[];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface NavigateResponse {
  legs: RouteLeg[];
  total_distance: number;
  total_duration: number;
  total_transfers: number;
  global_bbox: [number, number, number, number];
}

// -- Weight profile for multi-suggestion routing ----------------------------

export type SuggestionLabel = "fastest" | "least_walking" | "simplest" | "explorer";

export interface WeightProfile {
  walkPenaltyMultiplier: number;
  walkComfortMeters: number;
  walkEscalationRate: number;
  transitCostFactor: number;
  transferPenaltyMeters: number;
  boardingCostFactor: number;
  closurePenaltyMultiplier: number;
  /** Route IDs whose transit edges get a diversity penalty (Explorer only) */
  penalizedRouteIds?: Set<string>;
  /** Multiplier applied to penalized route transit edges */
  diversityPenalty?: number;
  /** Maximum allowed vehicle transfers (Explorer guardrail) */
  maxTransfers?: number;
}

export interface RouteSuggestion {
  label: SuggestionLabel;
  route: NavigateResponse;
}

export interface MultiNavigateResponse {
  suggestions: RouteSuggestion[];
}

// -- Valhalla walking types -------------------------------------------------

export interface ValhallaManeuver {
  type: number;
  instruction: string;
  length: number;
  time: number;
}

export interface WalkRouteResult {
  polyline: string;
  distance: number;
  duration: number;
  maneuvers: ValhallaManeuver[];
}
