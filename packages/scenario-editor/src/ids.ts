import type { AxialCoordinate } from "@atos/layout";
import type { ScenarioDocumentV1 } from "@atos/scenario";

export function slugForId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

export function allocateStableId(existingIds: Iterable<string>, baseId: string): string {
  const existing = new Set(existingIds);
  const normalizedBase = slugForId(baseId);
  if (!existing.has(normalizedBase)) {
    return normalizedBase;
  }
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${normalizedBase}-${suffix}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to allocate stable ID for ${normalizedBase}.`);
}

export function tileIdFor(type: string, coordinate: AxialCoordinate, document: ScenarioDocumentV1): string {
  return allocateStableId(document.layout.tiles.map((tile) => tile.id), `tile-${slugForId(type)}-${coordinate.q}-${coordinate.r}`);
}

export function duplicateTileIdFor(tileId: string, document: ScenarioDocumentV1): string {
  return allocateStableId(document.layout.tiles.map((tile) => tile.id), `${tileId}-copy`);
}

export function setPieceIdFor(type: string, tileId: string, document: ScenarioDocumentV1): string {
  return allocateStableId(document.layout.setPieces.map((setPiece) => setPiece.id), `sp-${slugForId(type)}-${tileId}`);
}

export function duplicateSetPieceIdFor(setPieceId: string, document: ScenarioDocumentV1): string {
  return allocateStableId(document.layout.setPieces.map((setPiece) => setPiece.id), `${setPieceId}-copy`);
}
