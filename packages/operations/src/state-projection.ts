import { createDispatchPlannerInput } from "@atos/dispatch";
import type { ChitQuantity, StableId, VehicleState } from "@atos/domain";
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
    const quantity = remainingQuantity(chit.quantity, progress.unloaded);
    const status = projectedChitStatus(chit.status, progress.status, quantity);
    return { ...chit, status, quantity };
  });

  const unavailableResourceIds = uniqueSorted([
    ...runtime.faults.flatMap((fault) => canonicalResourceIds(runtime.scenario, fault.targetId)),
    ...runtime.guidewayOccupancy.map((occupancy) => `guideway-link:${occupancy.linkId}`),
    ...runtime.serviceOccupancy.map((occupancy) => occupancy.resourceId),
  ]);
  const unavailableAssetIds = uniqueSorted(runtime.assets
    .filter((asset) => asset.health === "faulted" || asset.health === "maintenance_due")
    .map((asset) => asset.assetId));
  const activeReservations = runtime.reservations
    .filter((reservation) => reservation.status === "active" || reservation.status === "held")
    .sort((left, right) => left.reservation.id.localeCompare(right.reservation.id));
  const powerConstraintIds = uniqueSorted(runtime.eventHistory
    .filter((event) => event.type === "power_gate_failed" || event.type === "battery_reserve_violated")
    .flatMap((event) => event.affectedResourceIds.flatMap((resourceId) => canonicalResourceIds(runtime.scenario, resourceId))));

  return {
    projectedScenario,
    dispatchInput: createDispatchPlannerInput(projectedScenario, {
      currentTime: runtime.clock.currentTime,
      runtimeConstraints: {
        retainedReservations: activeReservations.map((reservation) => reservation.reservation),
        unavailableResourceIds,
        unavailableAssetIds,
        powerConstraintIds,
      },
    }),
    runtimeAssetStates: [...runtime.assets].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    activeReservations,
    unavailableResourceIds,
    unavailableAssetIds,
    activeConsistIds: runtime.consists
      .filter((consist) => consist.status === "formed" || consist.status === "forming")
      .map((consist) => consist.id)
      .sort(),
    currentTime: runtime.clock.currentTime,
    powerConstraintIds,
  };
}

function projectedChitStatus(
  currentStatus: "unsatisfied" | "candidate" | "reserved" | "active" | "satisfied" | "failed",
  progressStatus: "pending" | "loaded" | "satisfied" | "failed",
  quantity: ChitQuantity,
): "unsatisfied" | "candidate" | "reserved" | "active" | "satisfied" | "failed" {
  if (progressStatus === "failed") {
    return "failed";
  }
  if (progressStatus === "satisfied" || quantitySatisfied(quantity)) {
    return "satisfied";
  }
  if (progressStatus === "loaded") {
    return "active";
  }
  return currentStatus;
}

function remainingQuantity(original: ChitQuantity, fulfilled: ChitQuantity): ChitQuantity {
  return stripZeroQuantity({
    passengers: subtractQuantity(original.passengers, fulfilled.passengers),
    massKg: subtractQuantity(original.massKg, fulfilled.massKg),
    volumeLiters: subtractQuantity(original.volumeLiters, fulfilled.volumeLiters),
    energyWh: subtractQuantity(original.energyWh, fulfilled.energyWh),
  });
}

function subtractQuantity(original: number | undefined, fulfilled: number | undefined): number | undefined {
  if (original === undefined) {
    return undefined;
  }
  return Math.max(0, original - (fulfilled ?? 0));
}

function stripZeroQuantity(quantity: ChitQuantity): ChitQuantity {
  return Object.fromEntries(
    Object.entries(quantity).filter(([, value]) => typeof value === "number" && value > 0),
  ) as ChitQuantity;
}

function quantitySatisfied(quantity: ChitQuantity): boolean {
  return Object.values(quantity).every((value) => (value ?? 0) <= 0);
}

function canonicalResourceIds(scenario: ScenarioDocumentV1, resourceId: StableId): StableId[] {
  if (
    resourceId.startsWith("asset:") ||
    resourceId.startsWith("guideway-link:") ||
    resourceId.startsWith("station-zone:") ||
    resourceId.startsWith("power-window:")
  ) {
    return [resourceId];
  }
  if (scenario.guideway.links.some((link) => link.id === resourceId)) {
    return [resourceId, `guideway-link:${resourceId}`].sort();
  }
  if (scenario.serviceZones.some((zone) => zone.id === resourceId)) {
    return [resourceId, `station-zone:${resourceId}`].sort();
  }
  if (scenario.inventory.vehicles.some((vehicle) => vehicle.id === resourceId)) {
    return [resourceId, `asset:${resourceId}`].sort();
  }
  if (
    scenario.electrical.sources.some((source) => source.id === resourceId) ||
    scenario.electrical.loads.some((load) => load.id === resourceId) ||
    scenario.electrical.branches.some((branch) => branch.id === resourceId)
  ) {
    return [resourceId, `asset:${resourceId}`].sort();
  }
  return [resourceId];
}

function uniqueSorted(values: readonly StableId[]): StableId[] {
  return [...new Set(values)].sort();
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
