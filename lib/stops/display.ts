import type {
  RbzDisallowedDirection,
  RbzRestrictionType,
  RestrictedBoardingZoneResponse,
  StopDirectionality,
} from "@/contracts/responses";
import { decodePolyline } from "@/lib/map/polyline";

export function getRbzLineCoordinates(zone: Pick<RestrictedBoardingZoneResponse, "points" | "polyline">): Array<[number, number]> {
  const sortedPoints = [...zone.points]
    .sort((a, b) => a.sequence - b.sequence)
    .map((point) => point.point)
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  if (sortedPoints.length >= 2) {
    return sortedPoints;
  }

  if (zone.polyline.trim()) {
    return decodePolyline(zone.polyline);
  }

  return [];
}

export function formatRbzRestrictionType(restrictionType: RbzRestrictionType): string {
  return restrictionType === "universal" ? "Universal" : "Specific routes";
}

export function formatRbzDisallowedDirection(direction: RbzDisallowedDirection): string {
  switch (direction) {
  case "direction_to":
    return "Direction to";
  case "direction_back":
    return "Direction back";
  default:
    return "Both directions";
  }
}

export function formatStopDirectionality(directionality: StopDirectionality): string {
  switch (directionality) {
  case "direction_to":
    return "Towards city";
  case "direction_back":
    return "Towards origin";
  default:
    return "Both";
  }
}
