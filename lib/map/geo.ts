const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Great-circle distance in meters between two `[lat, lng]` points (WGS-84).
 */
export function haversineDistanceMeters(
  a: [number, number],
  b: [number, number],
): number {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;

  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const h =
    sinHalfLat * sinHalfLat
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinHalfLng * sinHalfLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function interpolatePoint(
  from: [number, number],
  to: [number, number],
  t: number,
): [number, number] {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;

  return [
    lat1 + (lat2 - lat1) * t,
    lng1 + (lng2 - lng1) * t,
  ];
}

/**
 * Walks a decoded polyline and returns points every `intervalMeters`,
 * always including the start (0m) and the final endpoint.
 */
export function samplePolylineAtInterval(
  coordinates: Array<[number, number]>,
  intervalMeters: number,
): Array<[number, number]> {
  if (coordinates.length === 0) {
    return [];
  }

  if (coordinates.length === 1 || intervalMeters <= 0) {
    return [coordinates[0]];
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const segmentLength = haversineDistanceMeters(coordinates[i], coordinates[i + 1]);
    segmentLengths.push(segmentLength);
    totalLength += segmentLength;
  }

  const getPointAtDistance = (distanceMeters: number): [number, number] => {
    let remaining = Math.max(0, Math.min(totalLength, distanceMeters));

    for (let i = 0; i < segmentLengths.length; i += 1) {
      const segmentLength = segmentLengths[i];
      if (remaining <= segmentLength || i === segmentLengths.length - 1) {
        const ratio = segmentLength <= Number.EPSILON ? 0 : remaining / segmentLength;
        return interpolatePoint(
          coordinates[i],
          coordinates[i + 1],
          Math.max(0, Math.min(1, ratio)),
        );
      }
      remaining -= segmentLength;
    }

    return coordinates[coordinates.length - 1];
  };

  const samples: Array<[number, number]> = [];
  for (let distance = 0; distance < totalLength; distance += intervalMeters) {
    samples.push(getPointAtDistance(distance));
  }

  const endpoint = coordinates[coordinates.length - 1];
  const lastSample = samples[samples.length - 1];
  if (
    !lastSample
    || haversineDistanceMeters(lastSample, endpoint) > Number.EPSILON
  ) {
    samples.push(endpoint);
  }

  return samples;
}
