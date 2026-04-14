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
  isPublic: boolean;
  points: Array<ClosurePointObject>;
}
