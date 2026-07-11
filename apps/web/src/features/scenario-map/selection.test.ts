import { describe, expect, it } from "vitest";
import {
  hasRelatedSelection,
  parseSelectionKey,
  relatedSelectionKeys,
  selectionKey,
  type ScenarioSelection,
} from "./selection";

describe("scenario map selection", () => {
  it("uses stable kind and ID keys", () => {
    expect(selectionKey({ kind: "tile", id: "tile-power" })).toBe("tile:tile-power");
    expect(parseSelectionKey("electricalLoad:sp-cargo-depot:cargo-handling")).toEqual({
      kind: "electricalLoad",
      id: "sp-cargo-depot:cargo-handling",
    });
  });

  it("computes one-hop related highlights without changing selection identity", () => {
    const tile: ScenarioSelection = { kind: "tile", id: "tile-platform" };
    const load: ScenarioSelection = {
      kind: "electricalLoad",
      id: "sp-passenger-platform:platform-lighting",
    };
    const relations = new Map([[selectionKey(load), [tile]]]);

    expect(relatedSelectionKeys(load, relations)).toEqual(new Set([selectionKey(tile)]));
    expect(hasRelatedSelection(load, tile, relations)).toBe(true);
  });
});
