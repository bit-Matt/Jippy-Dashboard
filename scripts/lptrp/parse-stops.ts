import fs from "node:fs";
import fsp from "node:fs/promises";

import { PATHS } from "./paths";
import type { Direction, ParsedStop, StopRouteRef } from "./types";

type StopMap = Map<string, ParsedStop>;

type ParseWarning = {
  kind: "empty_location" | "signage_conflict";
  message: string;
};

const ROUTE_SECTION_RE = /^## Route (\d+) — (.+)$/;
const DIRECTION_RE = /^### (Inbound|Outbound)/i;
const TABLE_ROW_RE = /^\|(.+)\|$/;

function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRouteNumbers(routeNoCell: string, currentRouteNo: number): number[] {
  const trimmed = routeNoCell.trim();
  if (!trimmed) return [currentRouteNo];

  const numbers = trimmed
    .split(/[/,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n));

  return numbers.length > 0 ? numbers : [currentRouteNo];
}

function stopKey(signageNo: number | null, location: string): string {
  if (signageNo !== null) return `signage:${signageNo}`;
  return `location:${normalizeLocation(location).toLowerCase()}`;
}

function routeRefKey(ref: StopRouteRef): string {
  return `${ref.route_no}:${ref.direction}:${ref.stop_sequence ?? "null"}`;
}

function mergeRouteRefs(existing: StopRouteRef[], incoming: StopRouteRef[]): StopRouteRef[] {
  const seen = new Set(existing.map(routeRefKey));
  const merged = [...existing];

  for (const ref of incoming) {
    const key = routeRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
  }

  return merged;
}

function parseTableRow(line: string): string[] | null {
  if (!TABLE_ROW_RE.test(line)) return null;

  const cells = line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());

  if (cells.length < 5) return null;
  if (cells.every((cell) => /^-+$/.test(cell))) return null;

  return cells;
}

function buildRouteRefs(
  routeNoCell: string,
  currentRouteNo: number,
  direction: Direction,
  stopSequence: number | null,
): StopRouteRef[] {
  return parseRouteNumbers(routeNoCell, currentRouteNo).map((route_no) => ({
    route_no,
    direction,
    stop_sequence: stopSequence,
  }));
}

function upsertStop(
  stops: StopMap,
  warnings: ParseWarning[],
  entry: {
    signageNo: number | null;
    location: string;
    barangay: string | null;
    routes: StopRouteRef[];
  },
): void {
  const location = normalizeLocation(entry.location);
  if (!location) {
    warnings.push({
      kind: "empty_location",
      message: `Skipped row with empty location (signage_no=${entry.signageNo ?? "none"})`,
    });
    return;
  }

  if (location.toUpperCase().startsWith("NOTE:")) return;

  const key = stopKey(entry.signageNo, location);
  const existing = stops.get(key);

  if (!existing) {
    stops.set(key, {
      signage_no: entry.signageNo,
      location,
      barangay: entry.barangay,
      routes: entry.routes,
    });
    return;
  }

  if (
    entry.signageNo !== null &&
    normalizeLocation(existing.location).toLowerCase() !== location.toLowerCase()
  ) {
    warnings.push({
      kind: "signage_conflict",
      message: `Signage #${entry.signageNo}: "${existing.location}" vs "${location}"`,
    });
  }

  if (!existing.barangay && entry.barangay) {
    existing.barangay = entry.barangay;
  }

  existing.routes = mergeRouteRefs(existing.routes, entry.routes);
}

export function parseLptrpStopsMarkdown(content: string): {
  stops: ParsedStop[];
  warnings: ParseWarning[];
} {
  const stops: StopMap = new Map();
  const warnings: ParseWarning[] = [];

  let currentRouteNo: number | null = null;
  let currentDirection: Direction | null = null;
  let inRouteSection = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const routeMatch = line.match(ROUTE_SECTION_RE);
    if (routeMatch) {
      currentRouteNo = Number.parseInt(routeMatch[1], 10);
      inRouteSection = true;
      currentDirection = null;
      continue;
    }

    if (!inRouteSection) continue;

    const directionMatch = line.match(DIRECTION_RE);
    if (directionMatch) {
      currentDirection = directionMatch[1].toLowerCase() as Direction;
      continue;
    }

    if (currentRouteNo === null || currentDirection === null) continue;

    const cells = parseTableRow(line);
    if (!cells) continue;

    const [stopCell, signageCell, locationCell, barangayCell, routeNoCell] = cells;
    if (stopCell === "Stop" && locationCell === "Location") continue;

    const signageNo = parseOptionalInt(signageCell);
    const stopSequence = parseOptionalInt(stopCell);
    const barangay = barangayCell.trim() || null;

    upsertStop(stops, warnings, {
      signageNo,
      location: locationCell,
      barangay,
      routes: buildRouteRefs(routeNoCell, currentRouteNo, currentDirection, stopSequence),
    });
  }

  const sorted = [...stops.values()].sort((a, b) => {
    if (a.signage_no !== null && b.signage_no !== null) {
      return a.signage_no - b.signage_no;
    }
    if (a.signage_no !== null) return -1;
    if (b.signage_no !== null) return 1;
    return a.location.localeCompare(b.location);
  });

  return { stops: sorted, warnings };
}

async function main() {
  if (!fs.existsSync(PATHS.sourceMd)) {
    throw new Error(`Source file not found: ${PATHS.sourceMd}`);
  }

  const content = await fsp.readFile(PATHS.sourceMd, "utf-8");
  const { stops, warnings } = parseLptrpStopsMarkdown(content);

  await fsp.writeFile(PATHS.parsedStops, JSON.stringify(stops, null, 2) + "\n", "utf-8");

  const withSignage = stops.filter((s) => s.signage_no !== null).length;
  const withoutSignage = stops.length - withSignage;

  console.log("LPTRP parse complete");
  console.log(`  Output: ${PATHS.parsedStops}`);
  console.log(`  Unique stops: ${stops.length}`);
  console.log(`  With signage_no: ${withSignage}`);
  console.log(`  Without signage_no: ${withoutSignage}`);
  console.log(`  Warnings: ${warnings.length}`);

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings.slice(0, 20)) {
      console.log(`  [${warning.kind}] ${warning.message}`);
    }
    if (warnings.length > 20) {
      console.log(`  ... and ${warnings.length - 20} more`);
    }
  }

  console.log("\nSample entries:");
  for (const stop of stops.slice(0, 3)) {
    console.log(JSON.stringify(stop, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
