import { decodePolyline, encodePolyline } from "@/lib/map/polyline";

type RoutePoint = {
  sequence: number;
  point: [number, number];
};

type OsrmRoute = {
  geometry?: string;
};

type OsrmRouteResponse = {
  routes?: OsrmRoute[];
  message?: string;
};

export async function getRoutePolyline(points: RoutePoint[]): Promise<string> {
  if (points.length < 2) {
    throw new Error("At least 2 points are required to build a route polyline.");
  }

  const osrmDrivingUrl = process.env.OSRM_DRIVING_URL;
  if (!osrmDrivingUrl) {
    throw new Error("OSRM_DRIVING_URL is not configured.");
  }

  const sortedPoints = [...points].sort((a, b) => a.sequence - b.sequence);
  const coordinates = sortedPoints
    .map((entry) => `${entry.point[1]},${entry.point[0]}`)
    .join(";");

  const serviceUrl = new URL(`/route/v1/driving/${coordinates}`, osrmDrivingUrl);
  serviceUrl.searchParams.set("overview", "full");
  serviceUrl.searchParams.set("geometries", "polyline6");
  serviceUrl.searchParams.set("steps", "false");

  const response = await fetch(serviceUrl.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OSRM driving request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OsrmRouteResponse;
  const geometry = payload.routes?.[0]?.geometry;

  if (!geometry) {
    throw new Error(payload.message ?? "OSRM driving response has no route geometry.");
  }

  const mergedCoordinates = decodePolyline(geometry);
  if (mergedCoordinates.length < 2) {
    throw new Error("OSRM returned insufficient route coordinates.");
  }

  return encodePolyline(mergedCoordinates);
}
