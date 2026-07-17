import { createDispatchPlannerInput } from "@atos/dispatch";
import type { VehicleState } from "@atos/domain";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import type { SimulationRuntimeState, RuntimeAssetState } from "@atos/simulation";
import type { ProjectedDispatchContext } from "./types";

export function projectRuntimeStateToDispatchInput(runtime: SimulationRuntimeState): ProjectedDispatchContext {
  const projectedScenario = cloneScenario(runtime.scenario);
  const nodeTileIds = new Map(runtime.scenario.guideway.nodes.map((node) => [node.id, node.tileId]));
  const runtimeAssets = new Map(runtime.assets.map((asset) => [asset.assetId, asset]));
  const progressByChit = new Map(
    runtime.missions.flatMap((mission) => mission.chitProgress.map((progress) => [progress.chitId, progress] as const)),
  );

  projectedScenario.simulation = {
    ...projectedScenario.simulation,
    currentTime: runtime.clock.currentTime,
  };
  projectedScenario.inventory = {
    ...projectedScenario.inventory,
    vehicles: projectedScenario.inventory.vehicles.map((vehicle) => {
      const runtimeAsset = runtimeAssets.get(vehicle.id);
      if (!runtimeAsset) {
        return vehicle;
      }
      return {
        ...vehicle,
        state: vehicleStateForRuntimeAsset(runtimeAsset),
        currentTileId: runtimeAsset.tileId ?? (runtimeAsset.nodeId ? nodeTileIds.get(runtimeAsset.nodeId) : undefined) ?? vehicle.currentTileId,
        battery: runtimeAsset.battery ? { ...runtimeAsset.battery } : vehicle.battery,
      };
    }),
  };
  projectedScenario.chits = projectedScenario.chits.map((chit) => {
    const progress = progressByChit.get(chit.id);
    if (!progress) {
      return chit;
    }
    const status = progress.status === "satisfied" ? "satisfied" : progress.status === "failed" ? "failed" : chit.status;
    return { ...chit, status };
  });

  const unavailableResourceIds = [
    ...runtime.faults.map((fault) => fault.targetId),
    ...runtime.serviceOccupancy.map((occupancy) => occupancy.resourceId),
  ].sort();
  const activeReservations = runtime.reservations
    .filter((reservation) => reservation.status === "active" || reservation.status === "held")
    .sort((left, right) => left.reservation.id.localeCompare(right.reservation.id));
  const powerConstraintIds = runtime.eventHistory
    .filter((event) => event.type === "power_gate_failed" || event.type === "battery_reserve_violated")
    .flatMap((event) => event.affectedResourceIds)
    .sort();

  return {
    projectedScenario,
    dispatchInput: createDispatchPlannerInput(projectedScenario, { currentTime: runtime.clock.currentTime }),
    runtimeAssetStates: [...runtime.assets].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    activeReservations,
    unavailableResourceIds,
    activeConsistIds: runtime.consists
      .filter((consist) => consist.status === "formed" || consist.status === "forming")
      .map((consist) => consist.id)
      .sort(),
    currentTime: runtime.clock.currentTime,
    powerConstraintIds,
  };
}

function vehicleStateForRuntimeAsset(asset: RuntimeAssetState): VehicleState {
  if (asset.health === "maintenance_due") {
    return "maintenance";
  }
  if (asset.health === "faulted") {
    return "maintenance";
  }
  if (asset.activeMissionId) {
    return "active";
  }
  if (asset.consistId) {
    return "reserved";
  }
  return "available";
}

function cloneScenario(scenario: ScenarioDocumentV1): ScenarioDocumentV1 {
  return JSON.parse(JSON.stringify(scenario)) as ScenarioDocumentV1;
}
