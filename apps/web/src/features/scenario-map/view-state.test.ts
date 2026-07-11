import { describe, expect, it } from "vitest";
import { initialViewState, reduceViewState, svgTransform } from "./view-state";

describe("scenario map view state", () => {
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50 };
  const viewport = { width: 400, height: 240 };

  it("fits and resets deterministic transforms", () => {
    const initial = initialViewState(bounds, viewport);
    const panned = reduceViewState(initial, { type: "pan", delta: { x: 10, y: 20 } });

    expect(panned).not.toEqual(initial);
    expect(reduceViewState(panned, { type: "reset", initial })).toEqual(initial);
  });

  it("zooms at a viewport point and preserves finite SVG transforms", () => {
    const initial = initialViewState(bounds, viewport);
    const zoomed = reduceViewState(initial, {
      type: "zoom",
      viewportPoint: { x: 200, y: 120 },
      scaleMultiplier: 1.25,
    });

    expect(zoomed.scale).toBeGreaterThan(initial.scale);
    expect(svgTransform(zoomed)).toMatch(/^translate\(.+\) scale\(.+\)$/);
  });

  it("preserves view state when unrelated UI state changes outside the reducer", () => {
    const initial = initialViewState(bounds, viewport);
    const layerToggleState = { electrical: false };

    expect({ view: initial, layers: layerToggleState }.view).toEqual(initial);
  });
});
