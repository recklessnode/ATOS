import { createDefaultDefinitionRegistry, extractElectricalGraph, extractGuidewayGraph } from "@atos/layout";
import { describe, expect, it } from "vitest";
import { sixTileCityFixture, loadSixTileCityFixture } from "./fixtures";
import { migrateScenarioDocument } from "./migrate";
import { parseScenarioDocument } from "./parser";
import { serializeScenarioDocument } from "./serializer";
import { summarizeScenarioDocument } from "./v1";

describe("scenario parsing", () => {
  it("loads the deterministic six-tile fixture", () => {
    const result = parseScenarioDocument(sixTileCityFixture);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("fixture should parse");
    }

    expect(summarizeScenarioDocument(result.document)).toEqual({
      title: "Six Tile City Fixture",
      schemaVersion: 1,
      tileCount: 6,
      guidewayNodeCount: 12,
      guidewayLinkCount: 12,
      electricalNodeCount: 12,
      electricalBranchCount: 12,
      electricalLoadCount: 5,
      stationCount: 1,
      serviceZoneCount: 3,
      vehicleCount: 4,
      openChitCount: 4,
      validationState: "valid",
    });
  });

  it("rejects malformed and incomplete scenarios with structured errors", () => {
    const result = parseScenarioDocument({
      schemaVersion: 1,
      scenario: { id: "broken" },
      layout: { tiles: [{ id: "tile-a" }], setPieces: [] },
      guideway: {},
      electrical: {},
      stations: [],
      serviceZones: [],
      inventory: {},
      contracts: [],
      chits: [],
      simulation: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("malformed scenario should not parse");
    }
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({
        path: expect.any(String),
        code: expect.any(String),
        message: expect.any(String),
      }),
    );
  });

  it("rejects unsupported future schema versions at the migration boundary", () => {
    const result = migrateScenarioDocument({ schemaVersion: 99 });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("future schema should not parse");
    }
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: "$.schemaVersion",
        code: "unsupported_future_schema_version",
      }),
    );
  });

  it("round-trips through deterministic serialization", () => {
    const document = loadSixTileCityFixture();
    const serialized = serializeScenarioDocument(document);
    const reparsed = parseScenarioDocument(JSON.parse(serialized));

    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) {
      throw new Error("serialized fixture should parse");
    }
    expect(serializeScenarioDocument(reparsed.document)).toBe(serialized);
  });

  it("extracts fixture graphs deterministically", () => {
    const registry = createDefaultDefinitionRegistry();
    const document = loadSixTileCityFixture();
    const firstGuideway = extractGuidewayGraph({
      tiles: document.layout.tiles,
      registry,
      stations: document.stations,
      serviceZones: document.serviceZones,
    });
    const secondGuideway = extractGuidewayGraph({
      tiles: document.layout.tiles,
      registry,
      stations: document.stations,
      serviceZones: document.serviceZones,
    });
    const firstElectrical = extractElectricalGraph({
      tiles: document.layout.tiles,
      setPieces: document.layout.setPieces,
      registry,
    });
    const secondElectrical = extractElectricalGraph({
      tiles: document.layout.tiles,
      setPieces: document.layout.setPieces,
      registry,
    });

    expect(secondGuideway).toEqual(firstGuideway);
    expect(secondElectrical).toEqual(firstElectrical);
    expect(firstGuideway.nodes).toEqual(document.guideway.nodes);
    expect(firstGuideway.links).toEqual(document.guideway.links);
    expect(firstElectrical.nodes).toEqual(document.electrical.nodes);
    expect(firstElectrical.branches).toEqual(document.electrical.branches);
    expect(firstElectrical.loads).toEqual(document.electrical.loads);
  });
});
