import type { StableId } from "@atos/domain";

export type EdgeIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type AxialCoordinate = {
  q: number;
  r: number;
};

export type PlacedTile = {
  id: StableId;
  type: StableId;
  version: number;
  coordinate: AxialCoordinate;
  orientation: number;
};

export type DuplicateTileOccupancy = {
  key: string;
  tileIds: StableId[];
};

const AXIAL_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const satisfies readonly AxialCoordinate[];

export const EDGE_INDEXES = [0, 1, 2, 3, 4, 5] as const satisfies readonly EdgeIndex[];

export function axialNeighbor(coordinate: AxialCoordinate, edge: EdgeIndex): AxialCoordinate {
  const direction = AXIAL_DIRECTIONS[edge];
  return {
    q: coordinate.q + direction.q,
    r: coordinate.r + direction.r,
  };
}

export function axialEquals(left: AxialCoordinate, right: AxialCoordinate): boolean {
  return left.q === right.q && left.r === right.r;
}

export function axialKey(coordinate: AxialCoordinate): string {
  return `${coordinate.q},${coordinate.r}`;
}

export function axialDistance(left: AxialCoordinate, right: AxialCoordinate): number {
  const dq = left.q - right.q;
  const dr = left.r - right.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

export function normalizeOrientation(orientation: number): EdgeIndex {
  return (((orientation % 6) + 6) % 6) as EdgeIndex;
}

// Edge numbering is pointy-top axial clockwise: 0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE.
export function rotateEdge(edge: EdgeIndex, steps: number): EdgeIndex {
  return normalizeOrientation(edge + steps);
}

export function oppositeEdge(edge: EdgeIndex): EdgeIndex {
  return rotateEdge(edge, 3);
}

export function mapLocalEdge(localEdge: EdgeIndex, tileOrientation: number): EdgeIndex {
  return rotateEdge(localEdge, normalizeOrientation(tileOrientation));
}

export function detectDuplicateTileOccupancy(
  tiles: readonly Pick<PlacedTile, "id" | "coordinate">[],
): DuplicateTileOccupancy[] {
  const occupancy = new Map<string, StableId[]>();

  for (const tile of tiles) {
    const key = axialKey(tile.coordinate);
    const tileIds = occupancy.get(key) ?? [];
    tileIds.push(tile.id);
    occupancy.set(key, tileIds);
  }

  return [...occupancy.entries()]
    .filter(([, tileIds]) => tileIds.length > 1)
    .map(([key, tileIds]) => ({ key, tileIds: [...tileIds].sort() }))
    .sort((left, right) => left.key.localeCompare(right.key));
}
