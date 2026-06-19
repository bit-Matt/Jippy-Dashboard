import type { StopDisallowedDirection, StopRestrictionType, StopResponse } from "@/contracts/responses";
import { decodePolyline } from "@/lib/routing/polyline";

export function getStopLineCoordinates(stop: Pick<StopResponse, "points" | "polyline">): Array<[number, number]> {
  const sortedPoints = [...stop.points]
    .sort((a, b) => a.sequence - b.sequence)
    .map((point) => point.point)
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  if (sortedPoints.length >= 2) {
    return sortedPoints;
  }

  if (stop.polyline.trim()) {
    return decodePolyline(stop.polyline);
  }

  return [];
}

export function formatStopRestrictionType(restrictionType: StopRestrictionType): string {
  return restrictionType === "universal" ? "Universal" : "Specific routes";
}

export function formatStopDisallowedDirection(direction: StopDisallowedDirection): string {
  switch (direction) {
  case "direction_to":
    return "Direction to";
  case "direction_back":
    return "Direction back";
  default:
    return "Both directions";
  }
}
