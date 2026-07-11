import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSixTileCityFixture, parseScenarioDocument } from "@atos/scenario";
import { describe, expect, it } from "vitest";
import {
  applyEditorCommand,
  buildSetPieceCatalog,
  buildTileCatalog,
  compareScenarios,
  createAutosaveRecord,
  createEditorState,
  exportScenarioJson,
  importScenarioJson,
  parseAutosaveRecord,
  scenarioExportFilename,
  serializeAutosaveRecord,
} from "./index";
import type { EditorCommand, EditorCommandFailure, EditorState } from "./types";

function applyOk(state: EditorState, command: EditorCommand): EditorState {
  const result = applyEditorCommand(state, command);
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.message} ${JSON.stringify(result.failure.diagnostics, null, 2)}`);
  }
  expect(result.ok).toBe(true);
  return result.state;
}

function applyFailure(state: EditorState, command: EditorCommand): EditorCommandFailure {
  const result = applyEditorCommand(state, command);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected command to fail.");
  }
  return result.failure;
}

describe("scenario editor package", () => {
  it("builds tile and set-piece catalogs from registry definitions", () => {
    const tiles = buildTileCatalog();
    const setPieces = buildSetPieceCatalog();

    expect(tiles.map((tile) => tile.type)).toEqual(expect.arrayContaining([
      "blank-utility-tile",
      "straight-guideway",
      "power-injection-curve",
      "portal-interchange",
    ]));
    expect(setPieces.map((setPiece) => setPiece.type)).toEqual(expect.arrayContaining([
      "passenger-platform",
      "cargo-warehouse",
      "local-power-module",
    ]));
    expect(tiles.find((tile) => tile.type === "power-injection-curve")?.builtInPower).toContain("source");
  });

  it("adds, moves, rotates, duplicates, and deletes tiles immutably", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    const added = applyOk(initial, {
      type: "tile.add",
      tileType: "blank-utility-tile",
      coordinate: { q: 4, r: 0 },
      id: "tile-editor-blank",
    });
    const moved = applyOk(added, { type: "tile.move", tileId: "tile-editor-blank", coordinate: { q: 4, r: -1 } });
    const rotated = applyOk(moved, { type: "tile.rotate", tileId: "tile-editor-blank", steps: 2 });
    const duplicated = applyOk(rotated, {
      type: "tile.duplicate",
      tileId: "tile-editor-blank",
      coordinate: { q: 5, r: -1 },
    });
    const removed = applyOk(duplicated, { type: "tile.remove", tileId: "tile-editor-blank-copy" });

    expect(initial.draft.layout.tiles).toHaveLength(6);
    expect(moved.draft.layout.tiles.find((tile) => tile.id === "tile-editor-blank")?.coordinate).toEqual({ q: 4, r: -1 });
    expect(rotated.draft.layout.tiles.find((tile) => tile.id === "tile-editor-blank")?.orientation).toBe(2);
    expect(duplicated.draft.layout.tiles.map((tile) => tile.id)).toContain("tile-editor-blank-copy");
    expect(removed.draft.layout.tiles.map((tile) => tile.id)).not.toContain("tile-editor-blank-copy");
  });

  it("keeps stable IDs through move/rotate and deterministic IDs through duplicate", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    const added = applyOk(initial, {
      type: "tile.add",
      tileType: "blank-utility-tile",
      coordinate: { q: 3, r: 0 },
      id: "tile-stable-id",
    });
    const moved = applyOk(added, { type: "tile.move", tileId: "tile-stable-id", coordinate: { q: 4, r: 0 } });
    const rotated = applyOk(moved, { type: "tile.rotate", tileId: "tile-stable-id", steps: 1 });
    const duplicated = applyOk(rotated, {
      type: "tile.duplicate",
      tileId: "tile-stable-id",
      coordinate: { q: 5, r: 0 },
    });

    expect(rotated.draft.layout.tiles.find((tile) => tile.id === "tile-stable-id")?.id).toBe("tile-stable-id");
    expect(duplicated.draft.layout.tiles.map((tile) => tile.id)).toContain("tile-stable-id-copy");
  });

  it("adds, moves, duplicates, and deletes allowed set pieces", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    const added = applyOk(initial, {
      type: "setPiece.add",
      setPieceType: "utility-cabinet",
      tileId: "tile-power",
      id: "sp-editor-utility",
    });
    const moved = applyOk(added, {
      type: "setPiece.move",
      setPieceId: "sp-editor-utility",
      tileId: "tile-utility",
    });
    const duplicated = applyOk(moved, { type: "setPiece.duplicate", setPieceId: "sp-editor-utility" });
    const removed = applyOk(duplicated, { type: "setPiece.remove", setPieceId: "sp-editor-utility-copy" });

    expect(added.draft.layout.setPieces.map((setPiece) => setPiece.id)).toContain("sp-editor-utility");
    expect(moved.draft.layout.setPieces.find((setPiece) => setPiece.id === "sp-editor-utility")?.tileId).toBe("tile-utility");
    expect(duplicated.draft.layout.setPieces.map((setPiece) => setPiece.id)).toContain("sp-editor-utility-copy");
    expect(removed.draft.layout.setPieces.map((setPiece) => setPiece.id)).not.toContain("sp-editor-utility-copy");
  });

  it("rejects duplicate occupancy, incompatible connectors, and orphaned set pieces", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    expect(applyFailure(initial, {
      type: "tile.add",
      tileType: "blank-utility-tile",
      coordinate: { q: 1, r: 0 },
    }).code).toBe("duplicate_tile_occupancy");

    const standard = applyOk(initial, {
      type: "tile.add",
      tileType: "straight-guideway",
      coordinate: { q: 10, r: 0 },
      id: "tile-standard-test",
      commitWarnings: true,
    });
    const incompatible = applyFailure(standard, {
      type: "tile.add",
      tileType: "maintenance-gauge-curve",
      coordinate: { q: 11, r: 0 },
      orientation: 3,
      id: "tile-maintenance-test",
      commitWarnings: true,
    });
    expect(incompatible.code).toBe("blocking_diagnostics");
    expect(incompatible.diagnostics.some((diagnostic) => diagnostic.code === "incompatible_guideway_connector")).toBe(true);

    const orphaned = {
      ...initial.draft,
      layout: {
        ...initial.draft.layout,
        setPieces: [
          ...initial.draft.layout.setPieces,
          { id: "sp-orphaned", type: "utility-cabinet", version: 1, tileId: "tile-missing" },
        ],
      },
    };
    expect(applyFailure(initial, { type: "import.replaceDraft", document: orphaned, commitWarnings: true }).code).toBe("blocking_diagnostics");
  });

  it("distinguishes valid-with-warning open-end edits from invalid edits", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    const warning = applyFailure(initial, {
      type: "tile.add",
      tileType: "straight-guideway",
      coordinate: { q: 20, r: 0 },
    });
    const committed = applyOk(initial, {
      type: "tile.add",
      tileType: "straight-guideway",
      coordinate: { q: 20, r: 0 },
      commitWarnings: true,
    });

    expect(warning.code).toBe("warnings_require_confirmation");
    expect(warning.diagnostics.some((diagnostic) => diagnostic.code === "open_guideway_end")).toBe(true);
    expect(committed.derived.validationState).toBe("warning");
  });

  it("supports undo, redo, and redo invalidation after divergent edits", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    const first = applyOk(initial, {
      type: "tile.add",
      tileType: "blank-utility-tile",
      coordinate: { q: 8, r: 0 },
      id: "tile-history-a",
    });
    const second = applyOk(first, {
      type: "tile.add",
      tileType: "blank-utility-tile",
      coordinate: { q: 9, r: 0 },
      id: "tile-history-b",
    });
    const undone = applyOk(second, { type: "history.undo" });
    const redone = applyOk(undone, { type: "history.redo" });
    const undoneAgain = applyOk(redone, { type: "history.undo" });
    const divergent = applyOk(undoneAgain, {
      type: "tile.add",
      tileType: "blank-utility-tile",
      coordinate: { q: 10, r: 0 },
      id: "tile-history-c",
    });

    expect(undone.draft.layout.tiles.map((tile) => tile.id)).not.toContain("tile-history-b");
    expect(redone.draft.layout.tiles.map((tile) => tile.id)).toContain("tile-history-b");
    expect(applyFailure(divergent, { type: "history.redo" }).code).toBe("redo_unavailable");
  });

  it("rebuilds graphs and reruns the power solver after edits and preset changes", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    const added = applyOk(initial, {
      type: "tile.add",
      tileType: "power-injection-curve",
      coordinate: { q: 7, r: 0 },
      commitWarnings: true,
    });
    const stressed = applyOk(added, { type: "power.setPreset", presetId: "brownout_stress" });

    expect(added.derived.electrical.sources.length).toBe(initial.derived.electrical.sources.length + 1);
    expect(added.derived.powerAnalysis.sources.length).toBe(initial.derived.powerAnalysis.sources.length + 1);
    expect(stressed.derived.powerAnalysis.metrics.totalRequestedLoadWatts).toBeGreaterThan(
      added.derived.powerAnalysis.metrics.totalRequestedLoadWatts,
    );
  });

  it("previews, rejects, and accepts executable power recommendations without mutating canonical state", () => {
    const initial = createEditorState(loadSixTileCityFixture(), { powerPresetId: "brownout_stress" });
    const recommendation = initial.derived.powerAnalysis.recommendations.find((item) => item.type === "add_source");
    expect(recommendation).toBeDefined();
    if (!recommendation) {
      throw new Error("Expected brownout stress to produce an add_source recommendation.");
    }

    const previewed = applyOk(initial, { type: "powerRecommendation.preview", recommendationId: recommendation.id });
    const rejected = applyOk(previewed, { type: "powerRecommendation.rejectPreview" });
    const accepted = applyOk(previewed, { type: "powerRecommendation.acceptPreview" });

    expect(previewed.preview?.executable).toBe(true);
    expect(initial.canonical.layout.tiles).toHaveLength(6);
    expect(rejected.preview).toBeUndefined();
    expect(rejected.draft.layout.tiles).toHaveLength(initial.draft.layout.tiles.length);
    expect(accepted.draft.layout.tiles.length).toBeGreaterThan(initial.draft.layout.tiles.length);
    expect(accepted.canonical.layout.tiles).toHaveLength(6);
  });

  it("marks unsupported recommendation previews as view-only", () => {
    const initial = createEditorState(loadSixTileCityFixture(), { powerPresetId: "brownout_stress" });
    const stateWithAdvisory: EditorState = {
      ...initial,
      derived: {
        ...initial.derived,
        powerAnalysis: {
          ...initial.derived.powerAnalysis,
          recommendations: [
            {
              id: "recommendation-reinforce-test",
              type: "reinforce_branch",
              affectedIds: ["tile-power:bus-link"],
              targetId: "tile-power:bus-link",
              targetKind: "branch",
              observedDeficiency: "Branch utilization is high.",
              proposedChange: "Reinforce the feeder branch.",
              score: {
                restoredCriticalTier: 0,
                brownoutElimination: 0,
                overloadElimination: 1,
                minimumVoltageImprovement: 0,
                branchHeadroomImprovement: 1,
                lossReduction: 0,
                servedLoadImprovement: 0,
                changeCostPenalty: 0,
                total: 2,
              },
              confidence: "medium",
              applicability: "heuristic",
              costClass: "medium",
              tradeoffs: ["Requires physical conductor changes."],
              explanation: "The power package does not include a scenario mutation for branch reinforcement.",
            },
          ],
        },
      },
    };
    const recommendation = stateWithAdvisory.derived.powerAnalysis.recommendations[0];

    const previewed = applyOk(stateWithAdvisory, { type: "powerRecommendation.preview", recommendationId: recommendation.id });
    expect(previewed.preview?.executable).toBe(false);
    expect(previewed.preview?.reason).toContain("scenario-level mutation data");
    expect(applyFailure(previewed, { type: "powerRecommendation.acceptPreview" }).code).toBe("view_only_recommendation");
  });

  it("compares before and after metrics with changed object IDs", () => {
    const initial = createEditorState(loadSixTileCityFixture());
    const added = applyOk(initial, {
      type: "tile.add",
      tileType: "power-injection-curve",
      coordinate: { q: 7, r: 0 },
      commitWarnings: true,
    });
    const comparison = compareScenarios(initial.draft, initial.derived.powerAnalysis, added.draft, added.derived.powerAnalysis);

    expect(comparison.metrics.map((metric) => metric.id)).toEqual(expect.arrayContaining([
      "minimumNodeVoltage",
      "worstVoltageDropPercent",
      "networkState",
    ]));
    expect(comparison.changedTiles).toContain("tile-power-injection-curve-7-0");
    expect(comparison.changedSources.length).toBeGreaterThan(0);
  });

  it("imports, rejects invalid imports, exports, and round-trips deterministic JSON", () => {
    const document = loadSixTileCityFixture();
    const json = exportScenarioJson(document);
    const imported = importScenarioJson(json);
    const invalid = importScenarioJson("{ broken json");

    expect(imported.ok).toBe(true);
    expect(invalid.ok).toBe(false);
    if (!imported.ok) {
      throw new Error("Expected exported scenario to import.");
    }
    expect(parseScenarioDocument(JSON.parse(json)).ok).toBe(true);
    expect(exportScenarioJson(imported.document)).toBe(json);
    expect(scenarioExportFilename(document)).toBe("six-tile-city-fixture-schema-v1.json");
  });

  it("recovers compatible autosaves and rejects incompatible saved versions", () => {
    const state = createEditorState(loadSixTileCityFixture(), { powerPresetId: "idle" });
    const record = createAutosaveRecord({
      draft: state.draft,
      selection: { kind: "tile", id: "tile-power" },
      powerPresetId: state.powerPresetId,
      savedAt: "2026-07-11T00:00:00.000Z",
    });
    const recovered = parseAutosaveRecord(serializeAutosaveRecord(record));
    const incompatible = parseAutosaveRecord(JSON.stringify({ ...record, schemaVersion: 99 }));

    expect(recovered.ok).toBe(true);
    if (!recovered.ok) {
      throw new Error("Expected autosave to recover.");
    }
    expect(recovered.record.draft.scenario.id).toBe(state.draft.scenario.id);
    expect(incompatible.ok).toBe(false);
  });

  it("does not import React from the framework-independent editor package", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const files = [
      "autosave.ts",
      "catalog.ts",
      "commands.ts",
      "comparison.ts",
      "history.ts",
      "ids.ts",
      "import-export.ts",
      "rebuild.ts",
      "recommendation-preview.ts",
      "reducer.ts",
      "types.ts",
      "validation.ts",
    ];

    for (const file of files) {
      const contents = readFileSync(join(root, file), "utf8");
      expect(contents).not.toMatch(/from ["']react["']/);
    }
  });
});
