import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSixTileCityFixture } from "@atos/scenario";
import { describe, expect, it } from "vitest";
import {
  analyzePowerNetwork,
  applyPowerPreset,
  buildConductanceMatrix,
  constantPowerBrownoutFixture,
  islandedLoadFixture,
  loadSheddingFixture,
  normalizeElectricalGraph,
  oneSourceOneResistorLoadFixture,
  overloadedBranchFixture,
  parallelLoadsFixture,
  seriesSegmentsFixture,
  solvePowerNetwork,
  solvePowerNetworkWithShedding,
  sourceLimitedFixture,
} from "./index";
import type { PowerNetworkInput } from "./types";

describe("power solver", () => {
  it("builds a deterministic conductance matrix", () => {
    const normalized = normalizeElectricalGraph(oneSourceOneResistorLoadFixture());
    const system = buildConductanceMatrix(normalized);

    expect(system.unknownNodeIds).toEqual(["load"]);
    expect(system.matrix[0]?.[0]).toBeCloseTo(1.25, 6);
    expect(system.rhs[0]).toBeCloseTo(24, 6);
  });

  it("solves a simple Ohm's-law circuit and conserves power", () => {
    const result = solvePowerNetwork(oneSourceOneResistorLoadFixture());

    expect(result.nodes.find((node) => node.id === "load")?.voltage).toBeCloseTo(19.2, 4);
    expect(result.branches.find((branch) => branch.id === "feed")?.currentAmps).toBeCloseTo(4.8, 4);
    expect(result.branches.find((branch) => branch.id === "feed")?.powerLossWatts).toBeCloseTo(23.04, 3);
    expect(Math.abs(result.metrics.powerBalanceResidualWatts)).toBeLessThan(0.001);
  });

  it("calculates series voltage drop", () => {
    const result = solvePowerNetwork(seriesSegmentsFixture());

    expect(result.nodes.find((node) => node.id === "mid")?.voltage).toBeCloseTo(21.6, 4);
    expect(result.nodes.find((node) => node.id === "load")?.voltage).toBeCloseTo(19.2, 4);
  });

  it("solves parallel constant-power loads deterministically", () => {
    const first = solvePowerNetwork(parallelLoadsFixture());
    const shuffled = solvePowerNetwork({
      ...parallelLoadsFixture(),
      loads: [...parallelLoadsFixture().loads].reverse(),
      branches: [...parallelLoadsFixture().branches].reverse(),
      nodes: [...parallelLoadsFixture().nodes].reverse(),
    });

    expect(first.metrics.networkState).toBe("nominal");
    expect(first.loads.map((load) => load.id)).toEqual(["load-a", "load-b"]);
    expect(shuffled.loads).toEqual(first.loads);
  });

  it("preserves branch current direction", () => {
    const input = oneSourceOneResistorLoadFixture();
    const result = solvePowerNetwork({
      ...input,
      branches: [
        {
          ...input.branches[0],
          fromNodeId: "load",
          toNodeId: "source",
        } as (typeof input.branches)[number],
      ],
    });

    expect(result.branches.find((branch) => branch.id === "feed")?.currentAmps).toBeLessThan(0);
  });

  it("classifies branch overloads and source limits", () => {
    const overloaded = solvePowerNetwork(overloadedBranchFixture());
    const sourceLimited = solvePowerNetwork(sourceLimitedFixture());

    expect(overloaded.metrics.networkState).toBe("overloaded");
    expect(overloaded.branches[0]?.state).toBe("overloaded");
    expect(sourceLimited.metrics.networkState).toBe("source_limited");
    expect(sourceLimited.sources[0]?.utilization).toBeGreaterThan(1);
  });

  it("detects islands and invalid graph references", () => {
    const islanded = solvePowerNetwork(islandedLoadFixture());
    const invalid = solvePowerNetwork({
      nodes: [{ id: "a" }],
      branches: [{ id: "bad", fromNodeId: "a", toNodeId: "missing", resistanceOhms: 0, currentLimitAmps: 1, enabled: true }],
      sources: [],
      loads: [],
    });

    expect(islanded.metrics.networkState).toBe("islanded");
    expect(islanded.loads[0]?.state).toBe("disconnected");
    expect(invalid.metrics.networkState).toBe("invalid");
    expect(invalid.diagnostics.some((diagnostic) => diagnostic.code === "invalid_network")).toBe(true);
  });

  it("handles constant-power non-convergence as explicit failure", () => {
    const result = solvePowerNetwork(constantPowerBrownoutFixture(), {
      maxIterations: 12,
      dampingFactor: 1,
    });

    expect(["non_converged", "brownout", "overloaded"]).toContain(result.metrics.networkState);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "non_converged" || diagnostic.code === "load_undervoltage")).toBe(true);
  });

  it("sheds by tier first, then priority, while preserving protected tiers", () => {
    const result = solvePowerNetworkWithShedding(loadSheddingFixture());

    expect(result.sheddingDecisions.map((decision) => decision.loadId)).toEqual(["decorative", "lighting"]);
    expect(result.loads.find((load) => load.id === "safety")?.state).toBe("served");
    expect(result.loads.find((load) => load.id === "control")?.state).toBe("served");
    expect(result.safetyPreserved).toBe(true);
    expect(result.controlPreserved).toBe(true);
  });

  it("reports protected-load infeasibility instead of silently shedding protected loads", () => {
    const protectedOnly: PowerNetworkInput = {
      nodes: [{ id: "source" }],
      branches: [],
      sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 20 }],
      loads: [
        { id: "safety", nodeId: "source", requestedWatts: 18, minimumVoltage: 20, loadClass: "safety", sheddingPriority: 0 },
        { id: "control", nodeId: "source", requestedWatts: 18, minimumVoltage: 20, loadClass: "control", sheddingPriority: 1 },
      ],
    };
    const result = solvePowerNetworkWithShedding(protectedOnly);

    expect(result.sheddingDecisions).toContainEqual(
      expect.objectContaining({ reasonCode: "protected_constraint_violation" }),
    );
    expect(result.loads.some((load) => load.state === "shed")).toBe(false);
    expect(result.safetyPreserved).toBe(false);
    expect(result.controlPreserved).toBe(false);
    expect(result.highestProtectedTierNotFullyServed).toBe(0);
  });

  it("summarizes consumer tiers", () => {
    const result = solvePowerNetworkWithShedding(loadSheddingFixture());
    const decorative = result.tierSummaries.find((tier) => tier.tier === 6);

    expect(decorative?.requestedWatts).toBe(24);
    expect(decorative?.shedWatts).toBe(24);
    expect(result.highestProtectedTierNotFullyServed).toBeUndefined();
  });

  it("detects weak layout patterns and ranks improving recommendations", () => {
    const result = analyzePowerNetwork(constantPowerBrownoutFixture());

    expect(result.findings.some((finding) => finding.type === "long_radial_feed")).toBe(true);
    expect(result.findings.some((finding) => finding.type === "far_end_load_cluster")).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0]?.score.total).toBeGreaterThan(0);
    expect(result.recommendations[0]?.preview?.before.networkState).toBe(result.metrics.networkState);
    expect(result.recommendations[0]?.preview?.after.totalDeliveredLoadWatts).toBeGreaterThanOrEqual(
      result.metrics.totalDeliveredLoadWatts,
    );
    expect(result.recommendations).toEqual(
      [...result.recommendations].sort((left, right) => {
        const scoreCompare = right.score.total - left.score.total;
        return Math.abs(scoreCompare) > 1e-9 ? scoreCompare : left.id.localeCompare(right.id);
      }),
    );
  });

  it("detects source bottlenecks, ineffective loops, and safety redundancy", () => {
    const bottleneck = analyzePowerNetwork({
      nodes: [{ id: "source" }, { id: "load" }],
      branches: [{ id: "source-neck", fromNodeId: "source", toNodeId: "load", resistanceOhms: 0.05, currentLimitAmps: 4.5, enabled: true }],
      sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
      loads: [{ id: "station", nodeId: "load", requestedWatts: 96, minimumVoltage: 20, loadClass: "passenger", sheddingPriority: 20 }],
    });
    const ineffectiveLoop = analyzePowerNetwork({
      nodes: [{ id: "source" }, { id: "load" }],
      branches: [
        { id: "strong-feed", fromNodeId: "source", toNodeId: "load", resistanceOhms: 0.1, currentLimitAmps: 5, enabled: true },
        { id: "weak-loop", fromNodeId: "source", toNodeId: "load", resistanceOhms: 2, currentLimitAmps: 5, enabled: true },
      ],
      sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
      loads: [{ id: "passenger", nodeId: "load", requestedWatts: 24, minimumVoltage: 20, loadClass: "passenger", sheddingPriority: 20 }],
    });
    const safetyRadial = analyzePowerNetwork({
      nodes: [{ id: "source" }, { id: "safety-node" }],
      branches: [{ id: "single-safety-feed", fromNodeId: "source", toNodeId: "safety-node", resistanceOhms: 0.1, currentLimitAmps: 5, enabled: true }],
      sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
      loads: [{ id: "brake-controller", nodeId: "safety-node", requestedWatts: 12, minimumVoltage: 20, loadClass: "braking", sheddingPriority: 0 }],
    });

    expect(bottleneck.findings.some((finding) => finding.type === "source_bottleneck")).toBe(true);
    expect(ineffectiveLoop.findings).toContainEqual(
      expect.objectContaining({ type: "ineffective_loop", targetId: "weak-loop" }),
    );
    expect(safetyRadial.findings).toContainEqual(
      expect.objectContaining({ type: "safety_redundancy", targetId: "single-safety-feed" }),
    );
  });

  it("rejects non-improving recommendations", () => {
    const result = analyzePowerNetwork(parallelLoadsFixture());

    expect(result.recommendations).toHaveLength(0);
  });

  it("solves six-tile idle and stress presets without mutating the fixture", () => {
    const document = loadSixTileCityFixture();
    const before = JSON.stringify(document);
    const idle = analyzePowerNetwork(applyPowerPreset(document.electrical, "idle"));
    const stress = analyzePowerNetwork(applyPowerPreset(document.electrical, "brownout_stress"));

    expect(JSON.stringify(document)).toBe(before);
    expect(idle.metrics.networkState).toBe("nominal");
    expect(idle.metrics.totalDeliveredLoadWatts).toBeGreaterThan(0);
    expect(stress.metrics.totalRequestedLoadWatts).toBeGreaterThan(idle.metrics.totalRequestedLoadWatts);
    expect(stress.findings.length).toBeGreaterThan(0);
    expect(stress.recommendations.length).toBeGreaterThan(0);
  });

  it("pins deterministic six-tile preset metrics", () => {
    const document = loadSixTileCityFixture();
    const expectations = [
      {
        preset: "idle",
        state: "nominal",
        sourceUtilizationPercent: 17.04,
        minimumVoltage: 23.94,
        deliveredWatts: 17,
        lossWatts: 0.03,
        worstBranchUtilizationPercent: 10.61,
        shedLoadCount: 0,
      },
      {
        preset: "normal_operations",
        state: "nominal",
        sourceUtilizationPercent: 50.34,
        minimumVoltage: 23.81,
        deliveredWatts: 50,
        lossWatts: 0.34,
        worstBranchUtilizationPercent: 26.92,
        shedLoadCount: 0,
      },
      {
        preset: "simultaneous_station_load",
        state: "nominal",
        sourceUtilizationPercent: 89.88,
        minimumVoltage: 23.66,
        deliveredWatts: 88.8,
        lossWatts: 1.08,
        worstBranchUtilizationPercent: 48.09,
        shedLoadCount: 0,
      },
      {
        preset: "propulsion_surge",
        state: "nominal",
        sourceUtilizationPercent: 92.99,
        minimumVoltage: 23.69,
        deliveredWatts: 92,
        lossWatts: 0.98,
        worstBranchUtilizationPercent: 63.9,
        shedLoadCount: 0,
      },
      {
        preset: "brownout_stress",
        state: "source_limited",
        sourceUtilizationPercent: 116.47,
        minimumVoltage: 23.7,
        deliveredWatts: 115.2,
        lossWatts: 1.27,
        worstBranchUtilizationPercent: 74.51,
        shedLoadCount: 4,
      },
    ] as const;

    for (const expected of expectations) {
      const result = analyzePowerNetwork(applyPowerPreset(document.electrical, expected.preset));

      expect(result.metrics.networkState).toBe(expected.state);
      expect((result.sources[0]?.utilization ?? 0) * 100).toBeCloseTo(expected.sourceUtilizationPercent, 2);
      expect(result.metrics.minimumNodeVoltage).toBeCloseTo(expected.minimumVoltage, 2);
      expect(result.metrics.totalDeliveredLoadWatts).toBeCloseTo(expected.deliveredWatts, 2);
      expect(result.metrics.totalConductorLossWatts).toBeCloseTo(expected.lossWatts, 2);
      expect(result.metrics.worstBranchId).toBe("electrical-connection:tile-power:bus-b:tile-station:bus-a");
      expect(result.metrics.worstBranchUtilization * 100).toBeCloseTo(expected.worstBranchUtilizationPercent, 2);
      expect(result.metrics.shedLoadCount).toBe(expected.shedLoadCount);
      expect(Math.abs(result.metrics.powerBalanceResidualWatts)).toBeLessThanOrEqual(0.02);
    }
  });

  it("contains no React imports", () => {
    const files = [
      "src/dc-solver.ts",
      "src/diagnostics.ts",
      "src/fixtures.ts",
      "src/index.ts",
      "src/linear-solver.ts",
      "src/load-shedding.ts",
      "src/normalize-network.ts",
      "src/presets.ts",
      "src/tier-policy.ts",
      "src/types.ts",
    ];

    for (const file of files) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      expect(text).not.toMatch(/from ["']react["']|React/);
    }
  });
});
