import { describe, expect, it } from "vitest";
import {
  axialToPixel,
  edgeAnchorPoint,
  fitBoundsToViewport,
  mapBoundsForTiles,
  panBy,
  pointyTopHexPoints,
  tileEdgeAnchorPoint,
  zoomAtPoint,
} from "./projection";

describe("pointy-top projection", () => {
  it("projects axial coordinates into SVG screen space", () => {
    expect(axialToPixel({ q: 0, r: 0 }, 10)).toEqual({ x: 0, y: 0 });
    expect(axialToPixel({ q: 1, r: 0 }, 10).x).toBeCloseTo(17.3205, 4);
    expect(axialToPixel({ q: 0, r: 1 }, 10)).toEqual({
      x: Math.sqrt(3) * 5,
      y: 15,
    });
  });

  it("generates pointy-top hex polygon points", () => {
    const points = pointyTopHexPoints({ x: 0, y: 0 }, 10);

    expect(points).toHaveLength(6);
    expect(points[0]?.x).toBeCloseTo(0);
    expect(points[0]?.y).toBeCloseTo(-10);
    expect(points[3]?.x).toBeCloseTo(0);
    expect(points[3]?.y).toBeCloseTo(10);
  });

  it("calculates map bounds for placed tiles", () => {
    const bounds = mapBoundsForTiles(
      [
        { coordinate: { q: 0, r: 0 } },
        { coordinate: { q: 1, r: 0 } },
      ],
      10,
      0,
    );

    expect(bounds.minY).toBeCloseTo(-10);
    expect(bounds.maxY).toBeCloseTo(10);
    expect(bounds.maxX).toBeGreaterThan(20);
  });

  it("fits bounds into a viewport with finite transform values", () => {
    expect(
      fitBoundsToViewport({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, { width: 400, height: 200 }, 20),
    ).toEqual({
      scale: 1.6,
      translateX: 200,
      translateY: 100,
    });
  });

  it("maps local tile edges through tile rotation", () => {
    const tile = { coordinate: { q: 0, r: 0 }, orientation: 2 };
    expect(tileEdgeAnchorPoint(tile, 0, 10)).toEqual(edgeAnchorPoint({ x: 0, y: 0 }, 2, 10));
  });

  it("preserves the cursor world point while zooming and pans by deltas", () => {
    const transform = { scale: 1, translateX: 0, translateY: 0 };
    const zoomed = zoomAtPoint(transform, { x: 100, y: 50 }, 2);

    expect(zoomed).toEqual({ scale: 2, translateX: -100, translateY: -50 });
    expect(panBy(zoomed, { x: 10, y: -5 })).toEqual({
      scale: 2,
      translateX: -90,
      translateY: -55,
    });
  });
});
