import type { DispatchPlannerResult, MissionPlan } from "@atos/dispatch";
import { createSimulationClock, mergeSimulationConfig } from "./clock";
import { orderedEventQueue, scheduleEvent } from "./event-queue";
import type {
  ChitFulfillmentProgress,
  RuntimeAssetState,
  RuntimeMission,
  RuntimeReservation,
  SimulationInput,
  SimulationRuntimeState,
} from "./types";

export function createInitialRuntimeState(input: SimulationInput): SimulationRuntimeState {
  const config = mergeSimulationConfig(input.config);
  const initialTime = input.scenario.simulation.currentTime;
  let state: SimulationRuntimeState = {
    schemaVersion: 1,
    scenario: input.scenario,
    dispatchResult: input.dispatchResult,
    config,
    clock: createSimulationClock(initialTime, config),
    eventQueue: [],
    eventHistory: [],
    missions: input.dispatchResult.missionPlans.map((plan) => runtimeMission(plan, input.dispatchResult)),
    assets: input.dispatchResult.assets.map(runtimeAsset),
    consists: input.dispatchResult.transientSuperWorkers.map((superWorker) => ({
      id: `runtime-consist:${superWorker.id}`,
      superWorker,
      missionId: missionIdForSuperWorker(superWorker.id, input.dispatchResult),
      memberAssetIds: [...superWorker.assetIds].sort(),
      status: "planned",
    })),
    guidewayOccupancy: [],
    serviceOccupancy: [],
    reservations: input.dispatchResult.reservations.map(runtimeReservation),
    faults: [],
    faultSchedule: [...(input.faultSchedule ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    replanningRequests: [],
  };

  for (const mission of state.missions.sort((left, right) => left.plan.id.localeCompare(right.plan.id))) {
    state = scheduleEvent(state, {
      timestamp: mission.plan.startsAt,
      type: "mission_accepted",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: mission.plan.reservationIds,
      payload: { chitIds: mission.plan.chitIds },
    });
  }

  for (const fault of state.faultSchedule) {
    state = scheduleEvent(state, {
      timestamp: fault.startsAt,
      type: "fault_raised",
      affectedResourceIds: [fault.targetId],
      payload: { faultId: fault.id, targetId: fault.targetId, faultType: fault.type },
      severity: fault.severity,
    });
    if (fault.endsAt) {
      state = scheduleEvent(state, {
        timestamp: fault.endsAt,
        type: "fault_cleared",
        affectedResourceIds: [fault.targetId],
        payload: { faultId: fault.id, targetId: fault.targetId, faultType: fault.type },
        severity: "info",
      });
    }
  }

  return { ...state, eventQueue: orderedEventQueue(state.eventQueue) };
}

export function findMission(
  state: SimulationRuntimeState,
  missionId: string | undefined,
): RuntimeMission | undefined {
  return missionId ? state.missions.find((mission) => mission.plan.id === missionId) : undefined;
}

export function updateMission(
  state: SimulationRuntimeState,
  missionId: string,
  update: (mission: RuntimeMission) => RuntimeMission,
): SimulationRuntimeState {
  return {
    ...state,
    missions: state.missions.map((mission) => mission.plan.id === missionId ? update(mission) : mission),
  };
}

export function updateAssets(
  state: SimulationRuntimeState,
  assetIds: readonly string[],
  update: (asset: RuntimeAssetState) => RuntimeAssetState,
): SimulationRuntimeState {
  const requested = new Set(assetIds);
  return {
    ...state,
    assets: state.assets.map((asset) => requested.has(asset.assetId) ? update(asset) : asset),
  };
}

export function missionChits(state: SimulationRuntimeState, plan: MissionPlan) {
  return state.dispatchResult.normalizedChits.filter((chit) => plan.chitIds.includes(chit.id));
}

export function missionServiceZoneResourceIds(plan: MissionPlan): string[] {
  return plan.reservationIds
    .map((reservationId) => reservationId.split(":station-zone:")[1])
    .filter((id): id is string => Boolean(id))
    .map((id) => `station-zone:${id}`)
    .sort();
}

export function releaseMissionReservations(
  state: SimulationRuntimeState,
  missionId: string,
  releasedAt: string,
): SimulationRuntimeState {
  return {
    ...state,
    reservations: state.reservations.map((reservation) =>
      reservation.reservation.missionPlanId === missionId
        ? { ...reservation, status: "released", releasedAt }
        : reservation
    ),
  };
}

export function holdMissionReservations(
  state: SimulationRuntimeState,
  missionId: string,
  acquiredAt: string,
): SimulationRuntimeState {
  return {
    ...state,
    reservations: state.reservations.map((reservation) =>
      reservation.reservation.missionPlanId === missionId
        ? { ...reservation, status: "held", acquiredAt }
        : reservation
    ),
  };
}

function runtimeMission(plan: MissionPlan, result: DispatchPlannerResult): RuntimeMission {
  return {
    plan,
    state: plan.state === "delayed" ? "delayed" : "planned",
    currentNodeId: plan.route.originNodeId,
    routeIndex: 0,
    energyConsumedWh: 0,
    eventIds: [],
    activeFaultIds: [],
    chitProgress: result.normalizedChits
      .filter((chit) => plan.chitIds.includes(chit.id))
      .map<ChitFulfillmentProgress>((chit) => ({
        chitId: chit.id,
        loaded: {},
        unloaded: {},
        status: "pending",
      })),
  };
}

function runtimeAsset(asset: DispatchPlannerResult["assets"][number]): RuntimeAssetState {
  return {
    assetId: asset.id,
    label: asset.label,
    kind: asset.kind,
    tileId: asset.tileId,
    serviceZoneId: asset.serviceZoneId,
    battery: asset.battery ? { ...asset.battery } : undefined,
    health: asset.state === "maintenance" ? "maintenance_due" : "nominal",
    faultIds: [],
    capacity: { ...asset.capacity },
  };
}

function runtimeReservation(reservation: DispatchPlannerResult["reservations"][number]): RuntimeReservation {
  return {
    reservation,
    status: "planned",
    conflictEventIds: [],
  };
}

function missionIdForSuperWorker(superWorkerId: string, result: DispatchPlannerResult): string {
  return result.missionPlans.find((plan) => plan.superWorkerId === superWorkerId)?.id ?? `unknown:${superWorkerId}`;
}
