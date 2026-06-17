import type { GpxTrackPoint, LatLng, WaypointOutput } from "./types";

export function sampleWaypointIndices(pointCount: number, targetCount = 20): number[] {
  if (pointCount <= 0) return [];
  if (pointCount <= targetCount) {
    return Array.from({ length: pointCount }, (_, i) => i);
  }

  const indices: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const index = Math.round((i * (pointCount - 1)) / (targetCount - 1));
    if (!indices.includes(index)) {
      indices.push(index);
    }
  }

  if (!indices.includes(0)) indices.unshift(0);
  if (!indices.includes(pointCount - 1)) indices.push(pointCount - 1);

  return [...new Set(indices)].sort((a, b) => a - b);
}

export function sampleWaypoints(
  points: GpxTrackPoint[],
  targetCount = 20,
): { waypoints: WaypointOutput[]; sampledIndices: number[] } {
  const indices = sampleWaypointIndices(points.length, targetCount);

  const waypoints = indices.map((index, sequence) => {
    const point = points[index];
    return {
      sequence,
      address: "",
      point: [point.lat, point.lng] as LatLng,
    };
  });

  return { waypoints, sampledIndices: indices };
}
