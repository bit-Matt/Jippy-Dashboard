/** A lat/lng coordinate pair [latitude, longitude] */
export type LatLng = [number, number];

export interface MultiNavigateResponse {
  suggestions: RouteSuggestion[];
}

export type SuggestionLabel = "fastest" | "least_walking" | "simplest" | "explorer";

export type LegType = "WALK" | "TRICYCLE" | "JEEPNEY";

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

export interface RouteLeg {
  type: LegType;
  route_name: string | null;
  route_id: string | null;
  route_number: string | null;
  polyline: string;
  color: string | null;
  distance: number;
  duration: number;
  fare: number;
  instructions: Instruction[];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface NavigateResponse {
  legs: RouteLeg[];
  total_distance: number;
  total_duration: number;
  total_fare: number;
  total_transfers: number;
  global_bbox: [number, number, number, number];
}

export interface RouteSuggestion {
  label: SuggestionLabel;
  route: NavigateResponse;
}
