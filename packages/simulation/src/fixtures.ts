import {
  createDispatchPlannerInput,
  planDispatch,
  type DispatchPlannerResult,
  type MissionPlan,
} from "@atos/dispatch";
import { loadSixTileCityFixture } from "@atos/scenario";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import type { SimulationFault, SimulationInput } from "./types";

export type SimulationFixtureId =
  | "simple-passenger"
  | "cargo-crane"
  | "consist-formation-split"
  | "charging-stop"
  | "reservation-delay"
  | "blocked-route"
  | "power-gate-delay"
  | "battery-support"
  | "asset-fault-replanning"
  | "concurrent-non-conflicting"
  | "conflicting-deterministic";

export const SIMULATION_FIXTURE_IDS: readonly SimulationFixtureId[] = [
  "simple-passenger",
  "cargo-crane",
  "consist-formation-split",
  "charging-stop",
  "reservation-delay",
  "blocked-route",
  "power-gate-delay",
  "battery-support",
  "asset-fault-replanning",
  "concurrent-non-conflicting",
  "conflicting-deterministic",
];

export function createSimulationFixture(id: SimulationFixtureId): SimulationInput {
  const scenario = loadSixTileCityFixture();
  switch (id) {
    case "simple-passenger":
      return inputForFilteredMissions(scenario, (plan) => plan.chitIds.includes("chit-express"));
    case "cargo-crane":
      return inputForFilteredMissions(scenario, (plan) => plan.chitIds.includes("chit-cargo"));
    case "consist-formation-split":
      return inputForFilteredMissions(scenario, (plan) =>
        plan.chitIds.includes("chit-commuter") && plan.chitIds.includes("chit-cargo")
      );
    case "charging-stop":
    case "battery-support":
      return inputForFilteredMissions(scenario, (plan) => plan.chitIds.includes("chit-battery"));
    case "reservation-delay":
    case "conflicting-deterministic":
      return conflictingMissionInput(scenario);
    case "blocked-route":
      return blockedRouteInput(scenario);
    case "power-gate-delay":
      return delayedPowerGateInput(scenario);
    case "asset-fault-replanning":
      return assetFaultInput(scenario);
    case "concurrent-non-conflicting":
      return inputForFilteredMissions(scenario, (_plan, index) => index < 2);
  }
}

export function createDefaultSimulationInput(): SimulationInput {
  const scenario = loadSixTileCityFixture();
  return {
    scenario,
    dispatchResult: planDispatch(createDispatchPlannerInput(scenario)),
  };
}

function inputForFilteredMissions(
  scenario: ScenarioDocumentV1,
  predicate: (plan: MissionPlan, index: number) => boolean,
): SimulationInput {
  const result = planDispatch(createDispatchPlannerInput(scenario));
  return {
    scenario,
    dispatchResult: filterDispatchResult(result, predicate),
  };
}

function blockedRouteInput(scenario: ScenarioDocumentV1): SimulationInput {
  const base = inputForFilteredMissions(scenario, (plan) => plan.route.linkIds.length > 0);
  const mission = base.dispatchResult.missionPlans[0];
  const linkId = mission?.route.linkIds[0] ?? "missing-link";
  return {
    ...base,
    faultSchedule: [{
      id: "fault:block:first-link",
      type: "guideway_segment_blocked",
      targetId: linkId,
      startsAt: mission?.startsAt ?? scenario.simulation.currentTime,
      behavior: "request_replanning",
      severity: "error",
      message: `Guideway segment ${linkId} is blocked for deterministic fixture testing.`,
    }],
  };
}

function delayedPowerGateInput(scenario: ScenarioDocumentV1): SimulationInput {
  const base = inputForFilteredMissions(scenario, (_plan, index) => index === 0);
  return {
    ...base,
    dispatchResult: {
      ...base.dispatchResult,
      missionPlans: base.dispatchResult.missionPlans.map((plan) => ({
        ...plan,
        state: "delayed",
        launchGate: {
          ...plan.launchGate,
          status: "delayed",
          networkState: "degraded",
          message: "Fixture launch delayed for power operator review.",
          reasonCodes: ["fixture_power_delay"],
        },
      })),
    },
  };
}

function assetFaultInput(scenario: ScenarioDocumentV1): SimulationInput {
  const base = inputForFilteredMissions(scenario, (_plan, index) => index === 0);
  const mission = base.dispatchResult.missionPlans[0];
  const assetId = mission?.assetIds[0] ?? "missing-asset";
  const fault: SimulationFault = {
    id: "fault:asset:replanning",
    type: "vehicle_unavailable",
    targetId: assetId,
    startsAt: mission?.startsAt ?? scenario.simulation.currentTime,
    behavior: "request_replanning",
    severity: "warning",
    message: `${assetId} became unavailable and requires dispatch replanning.`,
  };
  return { ...base, faultSchedule: [fault] };
}

function conflictingMissionInput(scenario: ScenarioDocumentV1): SimulationInput {
  const base = inputForFilteredMissions(scenario, (plan) => plan.route.linkIds.length > 0);
  const first = base.dispatchResult.missionPlans[0];
  if (!first) {
    return base;
  }
  const duplicate: MissionPlan = {
    ...first,
    id: "mission:fixture:conflicting-copy",
    chitId: "fixture-conflict-chit",
    chitIds: ["fixture-conflict-chit"],
    workerIds: [...first.workerIds],
    assetIds: [...first.assetIds],
    reservationIds: first.reservationIds.map((id) => `${id}:copy`),
    startsAt: first.startsAt,
    endsAt: first.endsAt,
  };
  return {
    ...base,
    dispatchResult: {
      ...base.dispatchResult,
      missionPlans: [first, duplicate].sort((left, right) => left.id.localeCompare(right.id)),
      reservations: [
        ...base.dispatchResult.reservations.filter((reservation) => reservation.missionPlanId === first.id),
        ...base.dispatchResult.reservations
          .filter((reservation) => reservation.missionPlanId === first.id)
          .map((reservation) => ({
            ...reservation,
            id: `${reservation.id}:copy`,
            missionPlanId: duplicate.id,
          })),
      ].sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

function filterDispatchResult(
  result: DispatchPlannerResult,
  predicate: (plan: MissionPlan, index: number) => boolean,
): DispatchPlannerResult {
  const selectedPlans = result.missionPlans.filter(predicate);
  const missionIds = new Set(selectedPlans.map((plan) => plan.id));
  const selectedSuperWorkerIds = new Set(selectedPlans.map((plan) => plan.superWorkerId));
  return {
    ...result,
    missionPlans: selectedPlans,
    reservations: result.reservations.filter((reservation) => missionIds.has(reservation.missionPlanId)),
    transientSuperWorkers: result.transientSuperWorkers.filter((worker) => selectedSuperWorkerIds.has(worker.id)),
  };
}
