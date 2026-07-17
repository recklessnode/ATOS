import type { SimulationRuntimeState } from "./types";

export type EnergyCheck = {
  ok: boolean;
  availableWh: number;
  reserveWh: number;
  requiredWh: number;
};

export function linkEnergyWh(state: SimulationRuntimeState, linkId: string): number {
  const link = state.scenario.guideway.links.find((candidate) => candidate.id === linkId);
  return link?.kind === "tile-connection"
    ? state.config.propulsionWhPerConnectionLink
    : state.config.propulsionWhPerInternalLink;
}

export function missionEnergyCheck(
  state: SimulationRuntimeState,
  missionId: string,
  nextRequiredWh = 0,
): EnergyCheck {
  const mission = state.missions.find((candidate) => candidate.plan.id === missionId);
  const batteries = state.assets.filter((asset) =>
    mission?.plan.assetIds.includes(asset.assetId) && asset.battery
  );
  const availableWh = batteries.reduce((sum, asset) => sum + (asset.battery?.stateOfChargeWh ?? 0), 0);
  const reserveWh = batteries.length * state.config.minimumBatteryReserveWh;
  return {
    ok: availableWh - nextRequiredWh >= reserveWh,
    availableWh: round(availableWh),
    reserveWh: round(reserveWh),
    requiredWh: round(nextRequiredWh),
  };
}

export function consumeMissionEnergy(
  state: SimulationRuntimeState,
  missionId: string,
  amountWh: number,
): SimulationRuntimeState {
  const mission = state.missions.find((candidate) => candidate.plan.id === missionId);
  if (!mission || amountWh <= 0) {
    return state;
  }
  const batteryAssets = state.assets
    .filter((asset) => mission.plan.assetIds.includes(asset.assetId) && asset.battery)
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  if (batteryAssets.length === 0) {
    return state;
  }
  const share = amountWh / batteryAssets.length;
  const batteryIds = new Set(batteryAssets.map((asset) => asset.assetId));
  return {
    ...state,
    assets: state.assets.map((asset) => {
      if (!asset.battery || !batteryIds.has(asset.assetId)) {
        return asset;
      }
      return {
        ...asset,
        battery: {
          ...asset.battery,
          stateOfChargeWh: round(Math.max(0, asset.battery.stateOfChargeWh - share)),
        },
      };
    }),
    missions: state.missions.map((candidate) =>
      candidate.plan.id === missionId
        ? { ...candidate, energyConsumedWh: round(candidate.energyConsumedWh + amountWh) }
        : candidate
    ),
  };
}

export function chargeMissionAssets(
  state: SimulationRuntimeState,
  missionId: string,
  durationSeconds: number,
): SimulationRuntimeState {
  const mission = state.missions.find((candidate) => candidate.plan.id === missionId);
  if (!mission) {
    return state;
  }
  const chargeWh = (state.config.chargingPowerWatts * durationSeconds) / 3600;
  const batteryAssets = state.assets
    .filter((asset) => mission.plan.assetIds.includes(asset.assetId) && asset.battery)
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  const share = batteryAssets.length > 0 ? chargeWh / batteryAssets.length : 0;
  const batteryIds = new Set(batteryAssets.map((asset) => asset.assetId));
  return {
    ...state,
    assets: state.assets.map((asset) => {
      if (!asset.battery || !batteryIds.has(asset.assetId)) {
        return asset;
      }
      return {
        ...asset,
        battery: {
          ...asset.battery,
          stateOfChargeWh: round(Math.min(asset.battery.usableCapacityWh, asset.battery.stateOfChargeWh + share)),
        },
      };
    }),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
