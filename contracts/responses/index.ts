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

export interface RouteResponse {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  routeDetails: string;
  availability: {
    from: string;
    to: string;
  };
  vehicle: {
    id: string;
    name: string;
  };
  polylines: {
    to: string;
    back: string;
  };
}

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

export interface RegionResponse {
  id: string;
  activeSnapshotId: string;
  snapshotName: string;
  snapshotState: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: RegionPointResponse[];
  stations: RegionStationResponse[];
}

export type RegionResponseList = RegionResponse[];

export interface ClosurePointResponse {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface ClosureResponse {
  id: string;
  activeSnapshotId: string;
  versionName: string;
  snapshotState: string;
  closureName: string;
  closureDescription: string;
  shape: string;
  points: ClosurePointResponse[];
}

export type ClosureResponseList = ClosureResponse[];

export interface DashboardAllResponse {
  routes: RouteResponseList;
  regions: RegionResponseList;
  closures: ClosureResponseList;
}
