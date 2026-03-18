export interface ClosurePointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface ClosureObject {
  id: string;
  closureName: string;
  closureDescription: string;
  points: Array<ClosurePointObject>;
}
