// ---------------------------------------------------------------------------
// Grid-based spatial index for efficient nearby-node lookups
// ---------------------------------------------------------------------------

// At the equator, 1 degree of latitude ≈ 111,320 meters.
// Cell size in degrees that approximates a given meter resolution.
const METERS_PER_DEGREE_LAT = 111_320;

export class GridIndex {
  private cells = new Map<string, string[]>();
  private positions = new Map<string, { lat: number; lng: number }>();
  private cellSizeDeg: number;

  constructor(cellSizeMeters: number) {
    this.cellSizeDeg = cellSizeMeters / METERS_PER_DEGREE_LAT;
  }

  insert(nodeId: string, lat: number, lng: number): void {
    this.positions.set(nodeId, { lat, lng });
    const key = this.cellKey(lat, lng);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(nodeId);
  }

  queryNearby(lat: number, lng: number, radiusMeters: number): string[] {
    const radiusDeg = radiusMeters / METERS_PER_DEGREE_LAT;
    const cellsToCheck = Math.ceil(radiusDeg / this.cellSizeDeg);

    const centerRow = Math.floor(lat / this.cellSizeDeg);
    const centerCol = Math.floor(lng / this.cellSizeDeg);

    const result: string[] = [];
    const radiusSq = radiusMeters * radiusMeters;

    for (let dr = -cellsToCheck; dr <= cellsToCheck; dr++) {
      for (let dc = -cellsToCheck; dc <= cellsToCheck; dc++) {
        const key = `${centerRow + dr}:${centerCol + dc}`;
        const bucket = this.cells.get(key);
        if (!bucket) continue;

        for (const nodeId of bucket) {
          const pos = this.positions.get(nodeId)!;
          const distSq = approxDistanceSquaredMeters(lat, lng, pos.lat, pos.lng);
          if (distSq <= radiusSq) {
            result.push(nodeId);
          }
        }
      }
    }

    return result;
  }

  private cellKey(lat: number, lng: number): string {
    const row = Math.floor(lat / this.cellSizeDeg);
    const col = Math.floor(lng / this.cellSizeDeg);
    return `${row}:${col}`;
  }
}

/**
 * Fast approximate squared distance in meters between two lat/lng points.
 * Uses equirectangular projection — accurate enough for small distances (<50km).
 */
function approxDistanceSquaredMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = (lat2 - lat1) * METERS_PER_DEGREE_LAT;
  const cosLat = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const dLng = (lng2 - lng1) * METERS_PER_DEGREE_LAT * cosLat;
  return dLat * dLat + dLng * dLng;
}
