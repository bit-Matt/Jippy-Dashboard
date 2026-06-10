export type Direction = "inbound" | "outbound";

export type StopRouteRef = {
  route_no: number;
  direction: Direction;
  stop_sequence: number | null;
};

export type ParsedStop = {
  signage_no: number | null;
  location: string;
  barangay: string | null;
  routes: StopRouteRef[];
};

export type GeocodeConfidence = "high" | "low" | "failed" | "manual";

export type GeocodedStop = ParsedStop & {
  lat: number | null;
  lng: number | null;
  geocode_confidence: GeocodeConfidence;
  geocode_query: string | null;
  geocode_display_name: string | null;
};

export type GeocodeOverride = {
  signage_no?: number;
  location?: string;
  lat: number;
  lng: number;
  note?: string;
};
