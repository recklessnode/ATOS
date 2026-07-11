import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePowerNetwork, islandedLoadFixture } from "@atos/power";
import { loadSixTileCityFixture } from "@atos/scenario";
import { buildDispatchAssets, buildDispatchWorkers } from "./assets";
import { cargoKindForServiceClass, normalizeDispatchChits, requiredCapabilitiesForKind } from "./normalization";
import { createDispatchPlannerInput, planDispatch } from "./planner";
import { routeBetweenEndpoints } from "./route";
import { generateSeededDispatchDemand } from "./seeded-demand";
import type { DispatchChit, DispatchPlannerInput } from "./types";

describe("ATOS dispatch planner", () => {
  it("normalizes universal chits with passenger and cargo service metadata", () => {
    const scenario = freshScenario();
    const chits = normalizeDispatchChits(scenario.chits, scenario.simulation.currentTime);

    expect(chits.map((chit) => chit.id)).toEqual([
      "chit-express",
      "chit-battery",
      "chit-commuter",
      "chit-cargo",
    ]);
    expect(chits.find((chit) => chit.id === "chit-express")?.serviceMetadata.passengerClass).toBe("express");
    expect(chits.find((chit) => chit.id === "chit-cargo")?.serviceMetadata.cargo).toMatchObject({
      serviceClass: "local",
      hazardous: false,
      perishable: false,
    });
    expect(cargoKindForServiceClass("hazard")).toBe("hazard-cargo");
    expect(requiredCapabilitiesForKind("hazard-cargo")).toContain("hazard-handling");
  });

  it("derives persistent assets, workers, and transient super-workers without mutating the scenario", () => {
    const scenario = freshScenario();
    const before = JSON.stringify(scenario);
    const assets = buildDispatchAssets(scenario);
    const workers = buildDispatchWorkers(assets);
    const result = planDispatch(createDispatchPlannerInput(scenario));

    expect(JSON.stringify(scenario)).toBe(before);
    expect(assets.map((asset) => asset.kind)).toEqual(expect.arrayContaining([
      "vehicle",
      "platform",
      "depot",
      "forklift",
      "crane",
      "charger",
      "guideway",
      "power-source",
    ]));
    expect(workers.some((worker) => worker.kind === "atomic" && worker.source === "vehicle")).toBe(true);
    expect(workers.some((worker) => worker.kind === "station" && worker.source === "station-zone")).toBe(true);
    expect(result.transientSuperWorkers).toHaveLength(result.missionPlans.length);
    expect(result.transientSuperWorkers[0]?.id).toMatch(/^super:/);
  });

  it("plans the deterministic six-tile fixture with stable mission and reservation identifiers", () => {
    const first = planDispatch(createDispatchPlannerInput(freshScenario()));
    const second = planDispatch(createDispatchPlannerInput(freshScenario()));

    expect(first.missionPlans.map((plan) => plan.chitId).sort()).toEqual([
      "chit-battery",
      "chit-cargo",
      "chit-commuter",
      "chit-express",
    ]);
    expect(first.missionPlans.map((plan) => plan.id)).toEqual(second.missionPlans.map((plan) => plan.id));
    expect(first.reservations.map((reservation) => reservation.id)).toEqual(
      second.reservations.map((reservation) => reservation.id),
    );
    expect(first.scoreBreakdown.total).toBeGreaterThan(0);
    expect(first.missionPlans.every((plan) => plan.steps.some((step) => step.id.endsWith(":launch-gate")))).toBe(true);
  });

  it("derives deterministic guideway routes between service zones", () => {
    const scenario = freshScenario();
    const route = routeBetweenEndpoints(scenario.guideway, {
      stationId: "station-central",
      serviceZoneId: "zone-passenger",
    }, {
      stationId: "station-central",
      serviceZoneId: "zone-cargo",
    });
    const repeated = routeBetweenEndpoints(scenario.guideway, {
      stationId: "station-central",
      serviceZoneId: "zone-passenger",
    }, {
      stationId: "station-central",
      serviceZoneId: "zone-cargo",
    });

    expect(route.reachable).toBe(true);
    expect(route.linkIds.length).toBeGreaterThan(0);
    expect(route).toEqual(repeated);
  });

  it("prevents impossible double-use of a discrete vehicle asset", () => {
    const scenario = freshScenario();
    const commuter = scenario.chits.find((chit) => chit.id === "chit-commuter");
    if (!commuter) {
      throw new Error("fixture missing commuter chit");
    }
    scenario.chits = [
      { ...commuter, id: "chit-commuter-a" },
      { ...commuter, id: "chit-commuter-b", priority: commuter.priority - 1 },
    ];
    scenario.inventory.vehicles = scenario.inventory.vehicles.filter(
      (vehicle) => vehicle.id === "vehicle-commuter-1",
    );

    const result = planDispatch(createDispatchPlannerInput(scenario));

    expect(result.missionPlans).toHaveLength(1);
    expect(result.deficiencyGates.some((gate) => gate.kind === "reservation_conflict")).toBe(true);
    expect(result.reservations.filter((reservation) => reservation.resourceId === "asset:vehicle-commuter-1")).toHaveLength(1);
  });

  it("reports actionable deficiencies for missing cargo capabilities and state of charge", () => {
    const scenario = freshScenario();
    scenario.chits = [];
    scenario.inventory.vehicles = scenario.inventory.vehicles.map((vehicle) =>
      vehicle.id === "vehicle-battery-1"
        ? { ...vehicle, battery: { ...vehicle.battery, stateOfChargeWh: 50 } }
        : vehicle,
    );
    const generatedChits = [
      generatedChit({ id: "generated:hazard", kind: "hazard-cargo" }),
      generatedChit({
        id: "generated:battery",
        kind: "battery-support",
        quantity: { energyWh: 120 },
        requirements: {
          requiredVehicleClasses: ["battery-support"],
          requiredCapabilities: ["battery-support", "power-sharing"],
          stopSensitivity: "direct",
        },
      }),
    ];

    const result = planDispatch(createDispatchPlannerInput(scenario, { generatedChits }));

    expect(result.deficiencyGates.map((gate) => gate.kind)).toEqual(
      expect.arrayContaining(["missing_capability", "state_of_charge"]),
    );
    expect(result.recommendations.some((recommendation) => recommendation.kind === "add_service_asset")).toBe(true);
  });

  it("uses power analysis as a planning launch gate without simulating movement", () => {
    const scenario = freshScenario();
    const input: DispatchPlannerInput = {
      ...createDispatchPlannerInput(scenario),
      powerAnalysis: analyzePowerNetwork(islandedLoadFixture()),
    };

    const result = planDispatch(input);

    expect(result.missionPlans).toHaveLength(0);
    expect(result.powerGateSummary.status).toBe("blocked");
    expect(result.deficiencyGates.every((gate) => gate.kind === "power_blocked")).toBe(true);
    expect(result.deficiencyGates[0]?.action).toContain("power");
  });

  it("generates seeded demand reproducibly", () => {
    const scenario = freshScenario();
    const options = {
      seed: "issue-12",
      count: 6,
      currentTime: scenario.simulation.currentTime,
      stationId: "station-central",
      serviceZoneIds: scenario.serviceZones.map((zone) => zone.id),
    };

    expect(generateSeededDispatchDemand(options)).toEqual(generateSeededDispatchDemand(options));
    expect(generateSeededDispatchDemand({ ...options, seed: "issue-12b" })).not.toEqual(
      generateSeededDispatchDemand(options),
    );
  });

  it("keeps the dispatch package React-free", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const source = sourceFiles(join(process.cwd(), "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(packageJson.dependencies?.react).toBeUndefined();
    expect(packageJson.devDependencies?.react).toBeUndefined();
    expect(source).not.toMatch(/from\s+["']react["']/);
  });
});

function generatedChit(overrides: Partial<DispatchChit>): DispatchChit {
  const kind = overrides.kind ?? "local-cargo";
  return {
    id: overrides.id ?? `generated:${kind}`,
    sourceChitId: overrides.sourceChitId,
    contractId: overrides.contractId ?? `contract:${overrides.id ?? kind}`,
    kind,
    status: overrides.status ?? "unsatisfied",
    origin: overrides.origin ?? {
      stationId: "station-central",
      serviceZoneId: "zone-cargo",
    },
    destination: overrides.destination ?? {
      stationId: "station-central",
      serviceZoneId: "zone-cargo",
    },
    readyAt: overrides.readyAt ?? "2026-07-10T00:00:00.000Z",
    dueAt: overrides.dueAt ?? "2026-07-10T00:10:00.000Z",
    priority: overrides.priority ?? 50,
    quantity: overrides.quantity ?? { massKg: 3, volumeLiters: 20 },
    requirements: overrides.requirements ?? {
      requiredVehicleClasses: ["cargo"],
      requiredCapabilities: requiredCapabilitiesForKind(kind),
      stopSensitivity: "normal",
    },
    penalties: overrides.penalties ?? {
      waitPerMinute: 1,
      latePerMinute: 3,
      transfer: 1,
      handling: 3,
    },
    serviceMetadata: overrides.serviceMetadata ?? {},
    rankScore: overrides.rankScore ?? 5000,
  };
}

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry);
    return statSync(fullPath).isDirectory() ? sourceFiles(fullPath) : [fullPath];
  });
}

function freshScenario() {
  return structuredClone(loadSixTileCityFixture());
}
