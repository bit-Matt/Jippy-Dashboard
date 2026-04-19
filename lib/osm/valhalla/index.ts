import { decodePolyline, encodePolyline } from "@/lib/routing/polyline";

type RoutePoint = {
  sequence: number;
  point: [number, number];
};

type ValhallaLeg = {
  shape?: string;
};

type ValhallaRouteResponse = {
  trip?: {
    legs?: ValhallaLeg[];
  };
};

export async function getRoutePolyline(points: RoutePoint[]): Promise<string> {
  if (points.length < 2) {
    throw new Error("At least 2 points are required to build a route polyline.");
  }

  const valhallaUrl = process.env.NEXT_PUBLIC_VALHALLA_URL;
  if (!valhallaUrl) {
    throw new Error("NEXT_PUBLIC_VALHALLA_URL is not configured.");
  }

  const sortedPoints = [...points].sort((a, b) => a.sequence - b.sequence);
  const serviceUrl = new URL("/route", valhallaUrl);
  const response = await fetch(serviceUrl.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      costing: "auto",
      directions_type: "none",
      locations: sortedPoints.map((x) => ({
        lat: x.point[0],
        lon: x.point[1],
        type: "break",
      })),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Valhalla request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as ValhallaRouteResponse;
  const legs = payload.trip?.legs ?? [];
  if (legs.length === 0) {
    throw new Error("Valhalla response has no route legs.");
  }

  const mergedCoordinates: Array<[number, number]> = [];

  for (const leg of legs) {
    if (!leg.shape) {
      throw new Error("Valhalla response leg is missing encoded shape.");
    }

    const coordinates = decodePolyline(leg.shape);
    if (coordinates.length === 0) {
      continue;
    }

    if (mergedCoordinates.length === 0) {
      mergedCoordinates.push(...coordinates);
      continue;
    }

    mergedCoordinates.push(...coordinates.slice(1));
  }

  if (mergedCoordinates.length < 2) {
    throw new Error("Valhalla returned insufficient route coordinates.");
  }

  return encodePolyline(mergedCoordinates);
}
