import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDispatchPlannerInput, planDispatch, type DeficiencyGate } from "@atos/dispatch";
import { loadSixTileCityFixture } from "@atos/scenario";
import {
  createSimulationFixture,
  initializeSimulation,
  runSimulationToCompletion,
  stepSimulationToNextEvent,
  type SimulationRuntimeState,
} from "@atos/simulation";
import {
  carryForwardDeficiencies,
  createDefaultOperationsSession,
  createOperationsSession,
  diffDispatchPlans,
  evaluateReplanningPolicy,
  performOperationsReplan,
  projectRuntimeStateToDispatchInput,
  reconcileReservations,
  requestManualReplan,
} from ".";

describe("ATOS operations orchestration", () => {
  it("classifies every replanning policy trigger deterministically", () => {
    const cases = [
      ["mission_failure", "partial"],
      ["route_blockage", "partial"],
      ["reservation_conflict", "partial"],
      ["asset_failure", "partial"],
      ["battery_power_failure", "partial"],
      ["power_launch_failure", "partial"],
      ["service_outage", "partial"],
      ["missed_deadline", "full"],
      ["material_queue_growth", "full"],
      ["released_high_priority_asset", "deferred"],
      ["operator_request", "full"],
      ["fault_cleared", "none"],
      ["completed_mission", "none"],
    ] as const;

    for (const [trigger, mode] of cases) {
      expect(evaluateReplanningPolicy({
        requestId: `request:${trigger}`,
        trigger,
        missionId: "mission:fixture",
        chitIds: ["chit-a"],
        affectedAssetIds: ["asset-a"],
        reason: trigger,
      }).mode).toBe(mode);
    }
  });

  it("projects runtime asset, chit, reservation, fault, power, and current-time state without mutating historical scenario input", () => {
    const input = createSimulationFixture("asset-fault-replanning");
    const before = JSON.stringify(input.scenario);
    const completedRuntime = runSimulationToCompletion(input);
    const runtime: SimulationRuntimeState = {
      ...completedRuntime,
      assets: completedRuntime.assets.map((asset) =>
        asset.kind === "vehicle" && asset.assetId === completedRuntime.assets.find((candidate) => candidate.kind === "vehicle")?.assetId
          ? { ...asset, health: "faulted", activeMissionId: "mission:projection-test" }
          : asset
      ),
    };
    const projection = projectRuntimeStateToDispatchInput(runtime);

    expect(JSON.stringify(input.scenario)).toBe(before);
    expect(projection.projectedScenario.simulation.currentTime).toBe(runtime.clock.currentTime);
    expect(projection.dispatchInput.options?.currentTime).toBe(runtime.clock.currentTime);
    expect(projection.runtimeAssetStates.map((asset) => asset.assetId)).toEqual(
      [...projection.runtimeAssetStates.map((asset) => asset.assetId)].sort(),
    );
    expect(projection.activeReservations.every((reservation) =>
      ["active", "held"].includes(reservation.status)
    )).toBe(true);
    expect(projection.unavailableResourceIds.length).toBeGreaterThan(0);
    expect(projection.projectedScenario.inventory.vehicles.some((vehicle) => vehicle.state === "maintenance" || vehicle.state === "active")).toBe(true);
  });

  it("reconciles retained, released, superseded, new, historical, and active-occupancy reservations", () => {
    let runtime = initializeSimulation(createSimulationFixture("consist-formation-split"));
    runtime = stepUntil(runtime, (state) => state.serviceOccupancy.some((occupancy) => occupancy.action === "loading"));
    const previousReservations = runtime.dispatchResult.reservations;
    const active = runtime.reservations.find((reservation) =>
      reservation.status === "active" && reservation.reservation.resourceId.startsWith("station-zone:")
    );
    const held = runtime.reservations.find((reservation) => reservation.status === "held" && reservation.reservation.id !== active?.reservation.id);
    if (!active || !held) {
      throw new Error("fixture did not produce active and held reservations");
    }
    const revisedReservations = [
      { ...active.reservation, id: "reservation:retained:copy" },
      { ...held.reservation, id: "reservation:new:fixture", resourceId: "station-zone:new-zone" },
    ];

    const result = reconcileReservations({
      previousReservations,
      runtimeReservations: runtime.reservations.map((reservation) =>
        reservation.reservation.id === held.reservation.id ? { ...reservation, status: "released" } : reservation
      ),
      revisedReservations,
      runtime,
    });

    expect(result.records.map((record) => record.status)).toEqual(expect.arrayContaining([
      "active_occupancy",
      "historical",
      "released",
      "new",
    ]));
    expect(result.activeOccupancyResourceIds).toContain(active.reservation.resourceId);
  });

  it("detects duplicate reservation ownership across overlapping windows", () => {
    const input = createSimulationFixture("conflicting-deterministic");
    const runtime = {
      ...initializeSimulation(input),
      reservations: initializeSimulation(input).reservations.map((reservation, index) =>
        index === 0 ? { ...reservation, status: "held" as const } : reservation
      ),
    };
    const first = runtime.reservations[0]?.reservation;
    if (!first) {
      throw new Error("fixture missing reservation");
    }
    const duplicate = {
      ...first,
      id: `${first.id}:duplicate-owner`,
      missionPlanId: "mission:duplicate-owner",
    };

    const result = reconcileReservations({
      previousReservations: [first],
      runtimeReservations: runtime.reservations,
      revisedReservations: [duplicate],
      runtime,
    });

    expect(result.duplicateOwnershipConflicts.some((conflict) =>
      conflict.reservationIds.includes(first.id) && conflict.reservationIds.includes(duplicate.id)
    )).toBe(true);
  });

  it("creates meaningful plan diffs for unchanged, delayed, cancelled, and replacement missions", () => {
    const scenario = loadSixTileCityFixture();
    const previous = planDispatch(createDispatchPlannerInput(scenario));
    const revised = {
      ...previous,
      scoreBreakdown: { ...previous.scoreBreakdown, total: previous.scoreBreakdown.total + 5 },
      missionPlans: [
        previous.missionPlans[0],
        previous.missionPlans[1] ? {
          ...previous.missionPlans[1],
          startsAt: new Date(Date.parse(previous.missionPlans[1].startsAt) + 60_000).toISOString(),
          endsAt: new Date(Date.parse(previous.missionPlans[1].endsAt) + 60_000).toISOString(),
        } : undefined,
        previous.missionPlans[0] ? {
          ...previous.missionPlans[0],
          id: "mission:replacement",
          chitIds: ["chit-replacement"],
          chitId: "chit-replacement",
        } : undefined,
      ].filter((mission): mission is NonNullable<typeof mission> => Boolean(mission)),
    };

    const diff = diffDispatchPlans({ previous, revised });

    expect(diff.unchangedMissionIds.length).toBeGreaterThan(0);
    expect(diff.delayedMissionIds.length).toBeGreaterThan(0);
    expect(diff.cancelledMissionIds.length).toBeGreaterThan(0);
    expect(diff.replacementMissionIds.length).toBeGreaterThan(0);
    expect(diff.rationale).toContain("score delta");
  });

  it("carries deficiencies forward and aggregates recurring infrastructure findings", () => {
    const previous = [
      deficiency("gate-a", "service_zone_full", "warning", ["chit-a"]),
      deficiency("gate-b", "power_blocked", "error", ["chit-b"]),
    ];
    const revised = [
      deficiency("gate-a", "service_zone_full", "error", ["chit-a"]),
      deficiency("gate-c", "route_unreachable", "warning", ["chit-b"]),
      deficiency("gate-d", "service_zone_full", "warning", ["chit-d"]),
    ];

    const carry = carryForwardDeficiencies(previous, revised);

    expect(carry.records.map((record) => record.status)).toEqual(expect.arrayContaining([
      "worsened",
      "transformed",
      "new",
    ]));
    expect(carry.infrastructureFindings.some((finding) => finding.kind === "service_zone_full")).toBe(true);
  });

  it("creates a deterministic operations session and performs partial replanning from a simulation request", () => {
    const session = createDefaultOperationsSession();
    const repeated = createDefaultOperationsSession();

    expect(session.pendingRequests.length).toBeGreaterThan(0);
    expect(session.policyDecisions[0]?.mode).toBe("partial");
    expect(session.sessionId).toBe(repeated.sessionId);

    const replanned = performOperationsReplan(session);
    expect(replanned.generations).toHaveLength(2);
    expect(replanned.pendingRequests).toHaveLength(0);
    expect(replanned.currentGenerationId).toBe(replanned.generations[1]?.id);
    expect(replanned.planDiff.records.length).toBeGreaterThan(0);
    expect(replanned.incidents.some((incident) => incident.resolutionState === "replanned" || incident.resolutionState === "resolved")).toBe(true);
  });

  it("adds and executes a deterministic manual full replan request", () => {
    const base = createOperationsSessionFromFixture("simple-passenger");
    const requested = requestManualReplan(base, { note: "Operator balancing test." });
    const manualRequest = requested.pendingRequests.find((request) => request.source === "operator");

    expect(manualRequest).toBeDefined();
    expect(requested.policyDecisions.find((decision) => decision.requestId === manualRequest?.id)?.mode).toBe("full");

    const replanned = performOperationsReplan(requested, manualRequest?.id);
    expect(replanned.generations).toHaveLength(2);
    expect(replanned.pendingRequests.some((request) => request.id === manualRequest?.id)).toBe(false);
  });

  it("calculates operations metrics for completion, conflicts, replans, energy delays, and planning churn", () => {
    const session = performOperationsReplan(createDefaultOperationsSession());

    expect(session.metrics.simulatedHours).toBeGreaterThan(0);
    expect(session.metrics.replansPerSimulatedHour).toBeGreaterThan(0);
    expect(session.metrics.missionCompletionRate).toBeGreaterThanOrEqual(0);
    expect(session.metrics.reservationConflictRate).toBeGreaterThanOrEqual(0);
    expect(session.metrics.planningChurn).toBeGreaterThanOrEqual(0);
    expect(Object.keys(session.metrics.missionFailuresByCause).length).toBeGreaterThan(0);
  });

  it("keeps package source free of React imports", () => {
    const files = sourceFiles(join(process.cwd(), "src"));
    const reactPackage = "re" + "act";
    const reactImportPattern = new RegExp(String.raw`\bfrom\s+["']${reactPackage}["']|@types/${reactPackage}|${reactPackage}-dom`);
    const offenders = files.filter((file) => reactImportPattern.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});

function createOperationsSessionFromFixture(id: Parameters<typeof createSimulationFixture>[0]) {
  const input = createSimulationFixture(id);
  return createOperationsSession({
    scenario: input.scenario,
    dispatchResult: input.dispatchResult,
    runtime: initializeSimulation(input),
  });
}

function stepUntil(
  state: SimulationRuntimeState,
  predicate: (state: SimulationRuntimeState) => boolean,
): SimulationRuntimeState {
  let next = state;
  for (let index = 0; index < 40 && !predicate(next); index += 1) {
    next = stepSimulationToNextEvent(next);
  }
  return next;
}

function deficiency(
  id: string,
  kind: DeficiencyGate["kind"],
  severity: DeficiencyGate["severity"],
  chitIds: string[],
): DeficiencyGate {
  return {
    id,
    kind,
    severity,
    message: `${kind} ${severity}`,
    action: `Resolve ${kind}`,
    chitIds,
    assetIds: [],
    affectedIds: chitIds,
  };
}

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });
}
