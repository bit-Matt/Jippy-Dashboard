// ---------------------------------------------------------------------------
// Turn-by-turn instruction generation for each leg type
// ---------------------------------------------------------------------------

import type {
  Instruction,
  ValhallaManeuver,
  PathSegment,
} from "@/lib/routing/types";

// ---------------------------------------------------------------------------
// Walk instructions — mapped from Valhalla maneuver types
// ---------------------------------------------------------------------------

// Valhalla maneuver type codes:
// 1 = kStart, 2 = kStartRight, 3 = kStartLeft, 4 = kDestination,
// 5 = kDestinationRight, 6 = kDestinationLeft, 7-24 = various turns
const DEPART_TYPES = new Set([1, 2, 3]);
const ARRIVE_TYPES = new Set([4, 5, 6]);

export function generateWalkInstructions(maneuvers: ValhallaManeuver[]): Instruction[] {
  return maneuvers.map((m) => {
    let maneuver_type: Instruction["maneuver_type"];
    if (DEPART_TYPES.has(m.type)) {
      maneuver_type = "depart";
    } else if (ARRIVE_TYPES.has(m.type)) {
      maneuver_type = "arrive";
    } else {
      maneuver_type = "turn";
    }

    return {
      text: m.instruction,
      maneuver_type,
    };
  });
}

// ---------------------------------------------------------------------------
// Tricycle instructions — templated
// ---------------------------------------------------------------------------

export function generateTricycleInstructions(stationName: string, isHail: boolean = false): Instruction[] {
  if (isHail) {
    return [
      {
        text: `Hail a tricycle near ${stationName}.`,
        maneuver_type: "board",
      },
      {
        text: "Alight tricycle at destination point.",
        maneuver_type: "alight",
      },
    ];
  }
  return [
    {
      text: `Board tricycle at ${stationName}.`,
      maneuver_type: "board",
    },
    {
      text: "Alight tricycle at destination point.",
      maneuver_type: "alight",
    },
  ];
}

// ---------------------------------------------------------------------------
// Jeepney instructions — templated with reverse geocoding for landmarks
// ---------------------------------------------------------------------------

export async function generateJeepneyInstructions(
  segment: PathSegment,
  distanceMeters: number,
): Promise<Instruction[]> {
  const instructions: Instruction[] = [];
  const firstNode = segment.nodes[0];
  const lastNode = segment.nodes[segment.nodes.length - 1];

  // Determine heading direction from route name + direction
  const directionLabel = segment.direction === "goingTo" ? "its destination" : "its origin";

  // Reverse geocode boarding point for a human-readable location
  const boardLocation = await reverseGeocodePoint(firstNode.lat, firstNode.lng);
  instructions.push({
    text: `Board the ${segment.routeName} jeepney at ${boardLocation} heading towards ${directionLabel}.`,
    maneuver_type: "board",
  });

  // Transit continuation
  const formattedDistance = formatDistance(distanceMeters);
  instructions.push({
    text: `Continue on ${segment.routeName} for ${formattedDistance}.`,
    maneuver_type: "depart",
  });

  // Alight instruction — try reverse geocoding for a street name
  const alightLocation = await reverseGeocodePoint(lastNode.lat, lastNode.lng);
  instructions.push({
    text: `Alight from jeepney at ${alightLocation}.`,
    maneuver_type: "alight",
  });

  return instructions;
}

// ---------------------------------------------------------------------------
// Transfer instruction
// ---------------------------------------------------------------------------

export function generateTransferInstruction(
  prevRouteName: string,
  nextRouteName: string,
): Instruction {
  return {
    text: `Transfer from ${prevRouteName} to ${nextRouteName}.`,
    maneuver_type: "transfer",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

const NOMINATIM_BASE = process.env.NEXT_PUBLIC_NOMINATIM_URL ?? "";

async function reverseGeocodePoint(lat: number, lng: number): Promise<string> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&format=jsonv2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();
    if (data?.display_name) {
      const addr = data.address;
      const road = addr?.road;
      const neighbourhood = addr?.neighbourhood;
      const suburb = addr?.suburb || addr?.village || addr?.quarter;
      if (road && suburb) return `${road}, ${suburb}`;
      if (road && neighbourhood) return `${road}, ${neighbourhood}`;
      if (road) return road;
      if (suburb) return suburb;
      return data.display_name.split(",").slice(0, 2).join(",").trim();
    }
  } catch {
    // Fall through to coordinate fallback
  }
  return `[${lat.toFixed(5)}, ${lng.toFixed(5)}]`;
}
