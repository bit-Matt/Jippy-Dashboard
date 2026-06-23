// ---------------------------------------------------------------------------
// Polyline encoding/decoding (Google algorithm, precision 1,000,000)
// Extracted from lib/osm/valhalla for shared use by the routing module.
// ---------------------------------------------------------------------------

const POLYLINE_PRECISION = 1_000_000;

export function decodePolyline(encoded: string): Array<[number, number]> {
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

export function encodePolyline(coordinates: Array<[number, number]>): string {
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
