import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSixTileCityFixture } from "@atos/scenario";
import { buildScenarioMapRenderModel, DEFAULT_SCENARIO_MAP_LAYERS } from "./render-model";
import { selectionKey } from "./selection";

describe("scenario map render model", () => {
  it("creates stable render IDs for the six-tile fixture", () => {
    const model = buildScenarioMapRenderModel(loadSixTileCityFixture());

    expect(model.tiles.map((tile) => tile.id)).toEqual([
      "tile-cargo",
      "tile-charging",
      "tile-platform",
      "tile-power",
      "tile-station",
      "tile-utility",
    ]);
    expect(model.guidewayNodes).toHaveLength(12);
    expect(model.guidewayLinks).toHaveLength(12);
    expect(model.electricalLoads).toHaveLength(5);
    expect(model.electricalSources).toHaveLength(1);
  });

  it("defines default layer visibility without mutating the scenario", () => {
    const document = loadSixTileCityFixture();
    const before = JSON.stringify(document);
    const model = buildScenarioMapRenderModel(document);

    expect(model.layers).toEqual(DEFAULT_SCENARIO_MAP_LAYERS);
    expect(model.layers.electrical).toBe(false);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("relates service zones to stable tile, station, guideway, set-piece, and load IDs", () => {
    const model = buildScenarioMapRenderModel(loadSixTileCityFixture());
    const selection = { kind: "serviceZone", id: "zone-passenger" } as const;
    const related = new Set(
      (model.relationMap.get(selectionKey(selection)) ?? []).map(selectionKey),
    );

    expect(related).toEqual(
      new Set([
        "station:station-central",
        "tile:tile-platform",
        "guidewayNode:tile-platform:guideway-b",
        "setPiece:sp-passenger-platform",
        "electricalLoad:sp-passenger-platform:platform-lighting",
      ]),
    );
  });

  it("creates actionable diagnostics for open guideway and electrical connectors", () => {
    const document = loadSixTileCityFixture();
    const singleTileDocument = {
      ...document,
      layout: {
        ...document.layout,
        tiles: [document.layout.tiles[0] as (typeof document.layout.tiles)[number]],
        setPieces: [],
      },
      stations: [],
      serviceZones: [],
    };
    const model = buildScenarioMapRenderModel(singleTileDocument);

    expect(model.diagnosticSummary.openGuidewayEnd).toBe(2);
    expect(model.diagnosticSummary.openElectricalConnector).toBe(2);
    expect(model.diagnostics[0]?.action).toMatch(/Inspect|Fix|Use/);
    expect(model.focusTargets.firstDiagnostic?.kind).toBe("diagnostic");
  });

  it("contains no React imports in framework-independent packages", () => {
    const packageFiles = [
      "packages/domain/src/index.ts",
      "packages/layout/src/index.ts",
      "packages/layout/src/projection.ts",
      "packages/scenario/src/index.ts",
    ];

    for (const file of packageFiles) {
      const text = readFileSync(join(process.cwd(), "..", "..", file), "utf8");
      expect(text).not.toMatch(/from ["']react["']|React/);
    }
  });
});
