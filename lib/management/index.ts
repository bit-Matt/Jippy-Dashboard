export interface ClosurePointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface ClosureObject {
  id: string;
  activeSnapshotId: string;
  versionName: string;
  snapshotState: string;
  closureName: string;
  closureDescription: string;
  shape: string;
  points: Array<ClosurePointObject>;
}
