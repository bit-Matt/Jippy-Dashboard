export type LatLng = [number, number];

export type GpxTrackPoint = {
  lat: number;
  lng: number;
};

export type ParsedGpx = {
  name: string;
  description: string;
  strokeColor: string;
  points: GpxTrackPoint[];
  dedupedPoints: GpxTrackPoint[];
};

export type RouteConfigEntry = {
  sourceFile?: string;
  routeNumber?: string;
  routeName?: string;
  routeColor?: string;
  routeDetails?: string;
  vehicleTypeId?: string;
};

export type RoutesConfig = Record<string, RouteConfigEntry>;

export type WaypointOutput = {
  sequence: number;
  address: string;
  point: LatLng;
};

export type RouteOutput = {
  routeNumber: string;
  routeName: string;
  routeColor: string;
  routeDetails: string;
  availableFrom: string;
  availableTo: string;
  vehicleTypeId: string;
  points: {
    polylineGoingTo: string;
    goingTo: WaypointOutput[];
    polylineGoingBack: string;
    goingBack: WaypointOutput[];
  };
};

export type FirstTownRoutesOutput = {
  ok: boolean;
  data: {
    routes: RouteOutput[];
  };
};

export type FailedGeocode = {
  slug: string;
  routeName: string;
  sequence: number;
  point: LatLng;
  error: string;
};

export type RouteConversionSummary = {
  slug: string;
  sourceFile: string;
  routeName: string;
  rawPointCount: number;
  dedupedPointCount: number;
  sampledIndices: number[];
  waypointCount: number;
  geocodeFailures: number;
};

export type ConversionSummary = {
  convertedAt: string;
  routeCount: number;
  totalGeocodeFailures: number;
  routes: RouteConversionSummary[];
};
