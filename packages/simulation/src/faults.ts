import type { ActiveFault, SimulationFault, SimulationRuntimeState } from "./types";

export function activeFaultsForTarget(
  state: SimulationRuntimeState,
  targetId: string,
): ActiveFault[] {
  return state.faults.filter((fault) => fault.targetId === targetId);
}

export function activeFaultsForMission(
  state: SimulationRuntimeState,
  missionId: string,
): ActiveFault[] {
  const mission = state.missions.find((candidate) => candidate.plan.id === missionId);
  if (!mission) {
    return [];
  }
  const targetIds = new Set([
    ...mission.plan.assetIds,
    ...mission.plan.route.linkIds,
    ...mission.plan.reservationIds,
  ]);
  return state.faults.filter((fault) => targetIds.has(normalizeFaultTarget(fault.targetId)));
}

export function raiseFault(
  state: SimulationRuntimeState,
  fault: SimulationFault,
  raisedEventId: string,
): SimulationRuntimeState {
  const active: ActiveFault = { ...fault, raisedEventId };
  return {
    ...state,
    faults: [...state.faults.filter((candidate) => candidate.id !== fault.id), active].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    assets: state.assets.map((asset) =>
      asset.assetId === fault.targetId
        ? { ...asset, health: healthForFault(fault), faultIds: [...new Set([...asset.faultIds, fault.id])].sort() }
        : asset
    ),
  };
}

export function clearFault(
  state: SimulationRuntimeState,
  faultId: string,
): SimulationRuntimeState {
  return {
    ...state,
    faults: state.faults.filter((fault) => fault.id !== faultId),
    assets: state.assets.map((asset) => ({
      ...asset,
      faultIds: asset.faultIds.filter((id) => id !== faultId),
      health: asset.faultIds.filter((id) => id !== faultId).length > 0 ? asset.health : "nominal",
    })),
  };
}

export function scheduledFaultById(
  state: SimulationRuntimeState,
  faultId: string | undefined,
): SimulationFault | undefined {
  return faultId ? state.faultSchedule.find((fault) => fault.id === faultId) : undefined;
}

function normalizeFaultTarget(targetId: string): string {
  return targetId
    .replace(/^guideway-link:/, "")
    .replace(/^asset:/, "")
    .replace(/^station-zone:/, "");
}

function healthForFault(fault: SimulationFault): "degraded" | "faulted" | "maintenance_due" {
  if (fault.type === "maintenance_due") {
    return "maintenance_due";
  }
  return fault.behavior === "delay" ? "degraded" : "faulted";
}
