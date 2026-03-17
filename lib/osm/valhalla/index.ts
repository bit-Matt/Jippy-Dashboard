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

const POLYLINE_PRECISION = 1_000_000;

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

function decodePolyline(encoded: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const latResult = decodeSingleValue(encoded, index);
    lat += latResult.value;
    index = latResult.nextIndex;

    const lngResult = decodeSingleValue(encoded, index);
    lng += lngResult.value;
    index = lngResult.nextIndex;

    coordinates.push([lat / POLYLINE_PRECISION, lng / POLYLINE_PRECISION]);
  }

  return coordinates;
}

function decodeSingleValue(encoded: string, startIndex: number): { value: number; nextIndex: number } {
  let result = 0;
  let shift = 0;
  let index = startIndex;

  while (true) {
    const byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;

    if (byte < 0x20) {
      break;
    }
  }

  return {
    value: (result & 1) ? ~(result >> 1) : (result >> 1),
    nextIndex: index,
  };
}

function encodePolyline(coordinates: Array<[number, number]>): string {
  let result = "";
  let previousLat = 0;
  let previousLng = 0;

  for (const [lat, lng] of coordinates) {
    const currentLat = Math.round(lat * POLYLINE_PRECISION);
    const currentLng = Math.round(lng * POLYLINE_PRECISION);

    result += encodeSignedValue(currentLat - previousLat);
    result += encodeSignedValue(currentLng - previousLng);

    previousLat = currentLat;
    previousLng = currentLng;
  }

  return result;
}

function encodeSignedValue(value: number): string {
  const shifted = value < 0 ? ~(value << 1) : (value << 1);
  return encodeUnsignedValue(shifted);
}

function encodeUnsignedValue(value: number): string {
  let remaining = value;
  let encoded = "";

  while (remaining >= 0x20) {
    encoded += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
    remaining >>= 5;
  }

  encoded += String.fromCharCode(remaining + 63);
  return encoded;
}
