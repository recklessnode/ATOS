import type { ServiceZone, StableId, VehicleCapacity } from "@atos/domain";
import type { ElectricalSource } from "@atos/layout";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import type { DispatchAsset, DispatchAssetKind, DispatchWorker } from "./types";

export function buildDispatchAssets(scenario: ScenarioDocumentV1): DispatchAsset[] {
  const vehicleAssets = scenario.inventory.vehicles.map<DispatchAsset>((vehicle) => ({
    id: vehicle.id,
    kind: "vehicle",
    label: vehicle.label,
    persistent: true,
    state: vehicle.state,
    tileId: vehicle.currentTileId,
    stationId: vehicle.homeStationId,
    vehicleClass: vehicle.vehicleClass,
    capabilities: uniqueSorted([vehicle.vehicleClass, ...vehicle.capabilities]),
    capacity: { ...vehicle.capacity },
    battery: { ...vehicle.battery },
  }));

  const stationAssets = scenario.stations.map<DispatchAsset>((station) => ({
    id: `asset:${station.id}`,
    kind: "station",
    label: station.label,
    persistent: true,
    state: "available",
    tileId: station.tileId,
    stationId: station.id,
    capabilities: ["station", "dispatch-control"],
    capacity: {},
  }));

  const zoneAssets = scenario.serviceZones.flatMap((zone) => serviceZoneAssets(zone));

  const guidewayAssets = scenario.guideway.links.map<DispatchAsset>((link) => ({
    id: `asset:${link.id}`,
    kind: "guideway",
    label: link.id,
    persistent: true,
    state: "available",
    capabilities: ["guideway", link.kind],
    capacity: {},
  }));

  const sourceAssets = scenario.electrical.sources.map((source) => powerSourceAsset(source));

  return [...vehicleAssets, ...stationAssets, ...zoneAssets, ...guidewayAssets, ...sourceAssets].sort(
    compareById,
  );
}

export function buildDispatchWorkers(assets: readonly DispatchAsset[]): DispatchWorker[] {
  const vehicleWorkers = assets
    .filter((asset) => asset.kind === "vehicle")
    .map<DispatchWorker>((asset) => ({
      id: `worker:${asset.id}`,
      kind: "atomic",
      label: asset.label,
      assetIds: [asset.id],
      stationId: asset.stationId,
      serviceZoneId: asset.serviceZoneId,
      tileId: asset.tileId,
      state: asset.state,
      capabilities: [...asset.capabilities].sort(),
      capacity: { ...asset.capacity },
      source: "vehicle",
    }));

  const stationWorkers = assets
    .filter((asset) => asset.kind !== "vehicle" && Boolean(asset.serviceZoneId))
    .map<DispatchWorker>((asset) => ({
      id: `worker:${asset.id}`,
      kind: "station",
      label: asset.label,
      assetIds: [asset.id],
      stationId: asset.stationId,
      serviceZoneId: asset.serviceZoneId,
      tileId: asset.tileId,
      state: asset.state,
      capabilities: [...asset.capabilities].sort(),
      capacity: { ...asset.capacity },
      source: "station-zone",
    }));

  return [...vehicleWorkers, ...stationWorkers].sort(compareById);
}

export function workerById(workers: readonly DispatchWorker[]): Map<StableId, DispatchWorker> {
  return new Map(workers.map((worker) => [worker.id, worker]));
}

export function assetById(assets: readonly DispatchAsset[]): Map<StableId, DispatchAsset> {
  return new Map(assets.map((asset) => [asset.id, asset]));
}

export function supportWorkersForServiceZones(
  workers: readonly DispatchWorker[],
  serviceZoneIds: readonly (StableId | undefined)[],
): DispatchWorker[] {
  const requested = new Set(serviceZoneIds.filter((id): id is StableId => Boolean(id)));
  return workers
    .filter((worker) => worker.source === "station-zone" && worker.serviceZoneId && requested.has(worker.serviceZoneId))
    .sort(compareById);
}

function serviceZoneAssets(zone: ServiceZone): DispatchAsset[] {
  const primary: DispatchAsset = {
    id: `asset:${zone.id}`,
    kind: serviceZoneAssetKind(zone),
    label: zone.label,
    persistent: true,
    state: "available",
    tileId: zone.guidewayAttachment.tileId,
    stationId: zone.stationId,
    serviceZoneId: zone.id,
    capabilities: serviceZoneCapabilities(zone),
    capacity: serviceZoneCapacity(zone),
  };

  if (zone.type === "cargo-depot") {
    return [
      primary,
      {
        ...primary,
        id: `asset:${zone.id}:forklift`,
        kind: "forklift",
        label: `${zone.label} forklift`,
        capabilities: ["cargo", "cargo-handling", "parcel-cargo"],
      },
      {
        ...primary,
        id: `asset:${zone.id}:crane`,
        kind: "crane",
        label: `${zone.label} crane`,
        capabilities: ["cargo", "cargo-handling", "bulk-handling"],
      },
    ];
  }

  if (zone.type === "charging-siding") {
    return [
      primary,
      {
        ...primary,
        id: `asset:${zone.id}:charger`,
        kind: "charger",
        label: `${zone.label} charger`,
        capabilities: ["battery-support", "charging", "power-sharing"],
        capacity: { energyWh: zone.capacity * 240 },
      },
    ];
  }

  if (zone.type === "maintenance") {
    return [
      primary,
      {
        ...primary,
        id: `asset:${zone.id}:maintenance-bay`,
        kind: "maintenance-bay",
        label: `${zone.label} maintenance bay`,
        capabilities: ["maintenance", "maintenance-supplies"],
      },
    ];
  }

  return [primary];
}

function serviceZoneAssetKind(zone: ServiceZone): DispatchAssetKind {
  switch (zone.type) {
    case "passenger-platform":
      return "platform";
    case "cargo-depot":
      return "depot";
    case "charging-siding":
      return "charger";
    case "maintenance":
      return "maintenance-bay";
    case "staging":
      return "shed";
  }
}

function serviceZoneCapabilities(zone: ServiceZone): StableId[] {
  switch (zone.type) {
    case "passenger-platform":
      return ["passenger", "passenger-boarding", "commuter-passenger", "express-passenger"];
    case "cargo-depot":
      return [
        "cargo",
        "cargo-handling",
        "local-cargo",
        "regional-cargo",
        "long-haul-cargo",
        "maintenance-supplies",
      ];
    case "charging-siding":
      return ["battery-support", "charging", "power-sharing"];
    case "maintenance":
      return ["maintenance", "maintenance-supplies"];
    case "staging":
      return ["repositioning", "staging"];
  }
}

function serviceZoneCapacity(zone: ServiceZone): VehicleCapacity {
  switch (zone.type) {
    case "passenger-platform":
      return { passengers: zone.capacity };
    case "cargo-depot":
      return { massKg: zone.capacity * 10, volumeLiters: zone.capacity * 80 };
    case "charging-siding":
      return { energyWh: zone.capacity * 240 };
    case "maintenance":
    case "staging":
      return {};
  }
}

function powerSourceAsset(source: ElectricalSource): DispatchAsset {
  return {
    id: `asset:${source.id}`,
    kind: "power-source",
    label: source.id,
    persistent: true,
    state: "available",
    tileId: source.nodeId.split(":")[0],
    capabilities: ["power-source", "launch-power"],
    capacity: { energyWh: source.maximumWatts },
  };
}

function uniqueSorted(values: readonly StableId[]): StableId[] {
  return [...new Set(values)].sort();
}

function compareById(left: { id: StableId }, right: { id: StableId }): number {
  return left.id.localeCompare(right.id);
}
