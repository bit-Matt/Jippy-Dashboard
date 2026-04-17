export interface RouteSequencePoint {
  id: string | number;
  sequence: number;
  address: string;
  point: [number, number];
}

export interface RoutePointResponse {
  polylineGoingTo: string;
  goingTo: RouteSequencePoint[];
  polylineGoingBack: string;
  goingBack: RouteSequencePoint[];
}

export interface RouteListItemResponse {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  fleetCount: number;
  polylines: {
    to: string;
    back: string;
  };
}

export interface RouteResponse extends RouteListItemResponse {
  activeSnapshotId: string;
  routeDetails: string;
  isPublic: boolean;
  availability: {
    from: string;
    to: string;
  };
  vehicle: {
    id: string;
    name: string;
  };
}

export interface RouteSnapshotResponse extends RouteResponse {
  snapshotName: string;
  snapshotState: string;
  points: RoutePointResponse;
}

export type RouteListItemResponseList = RouteListItemResponse[];
export type RouteResponseList = RouteResponse[];

export interface RegionPointResponse {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface RegionStationResponse {
  id: string;
  address: string;
  availableFrom: string;
  availableTo: string;
  point: [number, number];
}

export interface RegionListItemResponse {
  id: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: RegionPointResponse[];
}

export interface RegionResponse extends RegionListItemResponse {
  activeSnapshotId: string;
  isPublic: boolean;
  stations: RegionStationResponse[];
}

export interface RegionSnapshotResponse {
  id: string;
  snapshotId: string;
  snapshotName: string;
  snapshotState: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: RegionPointResponse[];
  stations: RegionStationResponse[];
}

export type RegionListItemResponseList = RegionListItemResponse[];
export type RegionResponseList = RegionResponse[];

export interface ClosurePointResponse {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface ClosureResponse {
  id: string;
  closureName: string;
  closureDescription: string;
  shape: string;
  closureType: "indefinite" | "scheduled";
  endDate: string | null;
  isPublic: boolean;
  points: ClosurePointResponse[];
}

export type ClosureResponseList = ClosureResponse[];

export interface ClosurePointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface ClosureObject {
  id: string;
  closureName: string;
  closureDescription: string;
  shape: string;
  closureType: "indefinite" | "scheduled";
  endDate: string | null;
  isPublic: boolean;
  points: Array<ClosurePointObject>;
}

export type StopRestrictionType = "universal" | "specific";

export interface StopPointResponse {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface StopResponse {
  id: string;
  name: string;
  restrictionType: StopRestrictionType;
  isPublic: boolean;
  points: StopPointResponse[];
  routeIds: string[];
  vehicleTypeIds: string[];
}

export type StopResponseList = StopResponse[];

// -- Navigate API response types -------------------------------------------

export type NavigateManeuverType =
  | "depart"
  | "turn"
  | "board"
  | "alight"
  | "transfer"
  | "arrive";

export type NavigateLegType = "WALK" | "TRICYCLE" | "JEEPNEY";

export interface NavigateInstruction {
  text: string;
  maneuver_type: NavigateManeuverType;
}

export interface NavigateRouteLeg {
  type: NavigateLegType;
  route_name: string | null;
  polyline: string;
  color: string | null;
  distance: number;
  duration: number;
  instructions: NavigateInstruction[];
  bbox: [number, number, number, number];
}

export interface NavigateRouteResponse {
  legs: NavigateRouteLeg[];
  total_distance: number;
  total_duration: number;
  total_transfers: number;
  global_bbox: [number, number, number, number];
}

export type NavigateSuggestionLabel = "fastest" | "least_walking" | "simplest" | "explorer";

export interface NavigateRouteSuggestion {
  label: NavigateSuggestionLabel;
  route: NavigateRouteResponse;
}

export interface MultiNavigateRouteResponse {
  suggestions: NavigateRouteSuggestion[];
}
