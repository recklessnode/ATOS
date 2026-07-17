import type { SimulationRuntimeState } from "./types";

export function formMissionConsist(
  state: SimulationRuntimeState,
  missionId: string,
  timestamp: string,
): SimulationRuntimeState {
  const mission = state.missions.find((candidate) => candidate.plan.id === missionId);
  if (!mission) {
    return state;
  }
  return {
    ...state,
    consists: state.consists.map((consist) =>
      consist.missionId === missionId
        ? { ...consist, status: "formed", formedAt: timestamp }
        : consist
    ),
    assets: state.assets.map((asset) =>
      mission.plan.assetIds.includes(asset.assetId)
        ? { ...asset, activeMissionId: missionId, consistId: mission.plan.superWorkerId }
        : asset
    ),
  };
}

export function startMissionConsistFormation(
  state: SimulationRuntimeState,
  missionId: string,
): SimulationRuntimeState {
  return {
    ...state,
    consists: state.consists.map((consist) =>
      consist.missionId === missionId ? { ...consist, status: "forming" } : consist
    ),
  };
}

export function startMissionConsistSplit(
  state: SimulationRuntimeState,
  missionId: string,
): SimulationRuntimeState {
  return {
    ...state,
    consists: state.consists.map((consist) =>
      consist.missionId === missionId ? { ...consist, status: "splitting" } : consist
    ),
  };
}

export function dissolveMissionConsist(
  state: SimulationRuntimeState,
  missionId: string,
  timestamp: string,
): SimulationRuntimeState {
  const mission = state.missions.find((candidate) => candidate.plan.id === missionId);
  if (!mission) {
    return state;
  }
  return {
    ...state,
    consists: state.consists.map((consist) =>
      consist.missionId === missionId
        ? { ...consist, status: "dissolved", dissolvedAt: timestamp }
        : consist
    ),
    assets: state.assets.map((asset) =>
      mission.plan.assetIds.includes(asset.assetId)
        ? { ...asset, activeMissionId: undefined, consistId: undefined }
        : asset
    ),
  };
}
