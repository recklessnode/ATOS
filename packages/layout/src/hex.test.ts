import { describe, expect, it } from "vitest";
import {
  axialDistance,
  axialNeighbor,
  detectDuplicateTileOccupancy,
  mapLocalEdge,
  normalizeOrientation,
  rotateEdge,
  type EdgeIndex,
} from "./hex";

describe("pointy-top axial hex geometry", () => {
  it("returns all six axial neighbors using the documented edge convention", () => {
    expect([0, 1, 2, 3, 4, 5].map((edge) => axialNeighbor({ q: 0, r: 0 }, edge as EdgeIndex))).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
  });

  it("calculates axial distance", () => {
    expect(axialDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(axialDistance({ q: -1, r: 1 }, { q: 1, r: -1 })).toBe(2);
    expect(axialDistance({ q: -2, r: 1 }, { q: 2, r: -2 })).toBe(4);
  });

  it("normalizes orientation and maps rotated tile edges", () => {
    expect(normalizeOrientation(8)).toBe(2);
    expect(normalizeOrientation(-1)).toBe(5);
    expect(rotateEdge(5, 2)).toBe(1);
    expect(mapLocalEdge(2, 4)).toBe(0);
  });

  it("detects duplicate tile occupancy", () => {
    expect(
      detectDuplicateTileOccupancy([
        { id: "tile-a", coordinate: { q: 0, r: 0 } },
        { id: "tile-b", coordinate: { q: 1, r: 0 } },
        { id: "tile-c", coordinate: { q: 0, r: 0 } },
      ]),
    ).toEqual([{ key: "0,0", tileIds: ["tile-a", "tile-c"] }]);
  });
});
