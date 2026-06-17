import fsp from "node:fs/promises";

import type { GpxTrackPoint, ParsedGpx } from "./types";

const TRKPT_RE = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
const METADATA_NAME_RE = /<metadata>[\s\S]*?<name>([^<]*)<\/name>/;
const METADATA_DESC_RE = /<metadata>[\s\S]*?<desc>([^<]*)<\/desc>/;
const STROKE_COLOR_RE = /stroke=#([0-9a-fA-F]{6})/;

function parseTrackPoints(xml: string): GpxTrackPoint[] {
  const points: GpxTrackPoint[] = [];

  for (const match of xml.matchAll(TRKPT_RE)) {
    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    points.push({ lat, lng });
  }

  return points;
}

export function dedupeConsecutivePoints(points: GpxTrackPoint[]): GpxTrackPoint[] {
  if (points.length === 0) return [];

  const deduped: GpxTrackPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = points[i];
    if (prev.lat === curr.lat && prev.lng === curr.lng) continue;
    deduped.push(curr);
  }

  return deduped;
}

function extractMetadataName(xml: string): string {
  return METADATA_NAME_RE.exec(xml)?.[1]?.trim() ?? "";
}

function extractMetadataDesc(xml: string): string {
  return METADATA_DESC_RE.exec(xml)?.[1]?.trim() ?? "";
}

function extractStrokeColor(xml: string): string {
  const hex = STROKE_COLOR_RE.exec(xml)?.[1];
  return hex ? `#${hex.toLowerCase()}` : "#2593d9";
}

export async function parseGpxFile(filePath: string): Promise<ParsedGpx> {
  const xml = await fsp.readFile(filePath, "utf-8");
  const points = parseTrackPoints(xml);

  if (points.length < 2) {
    throw new Error(`GPX file has fewer than 2 track points: ${filePath}`);
  }

  const dedupedPoints = dedupeConsecutivePoints(points);
  if (dedupedPoints.length < 2) {
    throw new Error(`GPX file has fewer than 2 unique track points after dedupe: ${filePath}`);
  }

  return {
    name: extractMetadataName(xml),
    description: extractMetadataDesc(xml),
    strokeColor: extractStrokeColor(xml),
    points,
    dedupedPoints,
  };
}
