import { describe, expect, it } from "vitest";
import { areGuidewayConnectorsCompatible } from "./connectors";
import { extractElectricalGraph } from "./electrical-extractor";
import { extractGuidewayGraph } from "./guideway-extractor";
import type { PlacedTile } from "./hex";
import { createDefaultDefinitionRegistry } from "./registry";
import type { SetPieceInstance } from "./tile-definition";

const loopTiles: PlacedTile[] = [
  { id: "tile-power", type: "power-injection-curve", version: 1, coordinate: { q: 1, r: 0 }, orientation: 2 },
  { id: "tile-platform", type: "passenger-station-curve", version: 1, coordinate: { q: 1, r: -1 }, orientation: 3 },
  { id: "tile-cargo", type: "cargo-depot-curve", version: 1, coordinate: { q: 0, r: -1 }, orientation: 4 },
  { id: "tile-utility", type: "utility-curve", version: 1, coordinate: { q: -1, r: 0 }, orientation: 5 },
  { id: "tile-charging", type: "charging-siding-curve", version: 1, coordinate: { q: -1, r: 1 }, orientation: 0 },
  { id: "tile-station", type: "passenger-station-curve", version: 1, coordinate: { q: 0, r: 1 }, orientation: 1 },
];

const setPieces: SetPieceInstance[] = [
  { id: "sp-station-control", type: "station-control", version: 1, tileId: "tile-station", localElectricalNodeId: "bus-a" },
  { id: "sp-passenger-platform", type: "passenger-platform", version: 1, tileId: "tile-platform", localElectricalNodeId: "bus-a" },
  { id: "sp-cargo-depot", type: "cargo-depot", version: 1, tileId: "tile-cargo", localElectricalNodeId: "bus-a" },
  { id: "sp-charging-siding", type: "charging-siding", version: 1, tileId: "tile-charging", localElectricalNodeId: "bus-a" },
  { id: "sp-yard-lighting", type: "yard-lighting", version: 1, tileId: "tile-utility", localElectricalNodeId: "bus-a" },
];

describe("connector compatibility", () => {
  it("accepts matching guideway connectors and rejects mismatched gauges", () => {
    expect(
      areGuidewayConnectorsCompatible(
        { kind: "guideway", gauge: "atos-standard", enabled: true },
        { kind: "guideway", gauge: "atos-standard", enabled: true },
      ).compatible,
    ).toBe(true);

    expect(
      areGuidewayConnectorsCompatible(
        { kind: "guideway", gauge: "atos-standard", enabled: true },
        { kind: "guideway", gauge: "maintenance", enabled: true },
      ),
    ).toEqual({
      compatible: false,
      reason: "guideway gauge mismatch: atos-standard != maintenance",
    });
  });
});

describe("guideway graph extraction", () => {
  it("extracts a stable closed loop", () => {
    const registry = createDefaultDefinitionRegistry();
    const first = extractGuidewayGraph({ tiles: loopTiles, registry });
    const second = extractGuidewayGraph({ tiles: loopTiles, registry });

    expect(second).toEqual(first);
    expect(first.nodes).toHaveLength(12);
    expect(first.links).toHaveLength(12);
    expect(first.openEnds).toHaveLength(0);
    expect(first.disconnectedComponents).toHaveLength(1);
  });

  it("reports open guideway ends", () => {
    const registry = createDefaultDefinitionRegistry();
    const graph = extractGuidewayGraph({
      tiles: [{ id: "tile-alone", type: "utility-curve", version: 1, coordinate: { q: 0, r: 0 }, orientation: 0 }],
      registry,
    });

    expect(graph.openEnds).toHaveLength(2);
    expect(graph.openEnds.map((end) => end.reason)).toEqual([
      "no-adjacent-tile",
      "no-adjacent-tile",
    ]);
  });

  it("reports disconnected guideway components", () => {
    const registry = createDefaultDefinitionRegistry();
    const graph = extractGuidewayGraph({
      tiles: [
        { id: "tile-a", type: "utility-curve", version: 1, coordinate: { q: 0, r: 0 }, orientation: 0 },
        { id: "tile-b", type: "utility-curve", version: 1, coordinate: { q: 4, r: 0 }, orientation: 0 },
      ],
      registry,
    });

    expect(graph.disconnectedComponents).toHaveLength(2);
    expect(graph.openEnds).toHaveLength(4);
  });

  it("rejects incompatible facing guideway connectors", () => {
    const registry = createDefaultDefinitionRegistry();
    const graph = extractGuidewayGraph({
      tiles: [
        { id: "tile-a", type: "utility-curve", version: 1, coordinate: { q: 0, r: 0 }, orientation: 0 },
        { id: "tile-b", type: "maintenance-gauge-curve", version: 1, coordinate: { q: 1, r: 0 }, orientation: 3 },
      ],
      registry,
    });

    expect(graph.incompatibleConnections).toHaveLength(1);
    expect(graph.incompatibleConnections[0]?.reason).toContain("guideway gauge mismatch");
  });
});

describe("electrical graph extraction", () => {
  it("extracts a stable electrical graph from tiles and set pieces", () => {
    const registry = createDefaultDefinitionRegistry();
    const first = extractElectricalGraph({ tiles: loopTiles, setPieces, registry });
    const second = extractElectricalGraph({ tiles: loopTiles, setPieces, registry });

    expect(second).toEqual(first);
    expect(first.nodes).toHaveLength(12);
    expect(first.branches).toHaveLength(12);
    expect(first.sources).toHaveLength(1);
    expect(first.loads).toHaveLength(5);
    expect(first.openConnectors).toHaveLength(0);
  });
});
