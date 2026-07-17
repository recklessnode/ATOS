import type { DispatchChit } from "@atos/dispatch";
import type { VehicleCapacity } from "@atos/domain";
import type { SimulationRuntimeState } from "./types";

export function loadingDurationSeconds(
  state: SimulationRuntimeState,
  chits: readonly DispatchChit[],
): number {
  return Math.ceil(
    state.config.baseLoadingSeconds +
    sum(chits, (chit) => chit.quantity.passengers) * state.config.passengerLoadSeconds +
    sum(chits, (chit) => chit.quantity.massKg) * state.config.cargoKgLoadSeconds,
  );
}

export function unloadingDurationSeconds(
  state: SimulationRuntimeState,
  chits: readonly DispatchChit[],
): number {
  return Math.ceil(
    state.config.baseUnloadingSeconds +
    sum(chits, (chit) => chit.quantity.passengers) * state.config.passengerUnloadSeconds +
    sum(chits, (chit) => chit.quantity.massKg) * state.config.cargoKgUnloadSeconds,
  );
}

export function loadedQuantityForChits(chits: readonly DispatchChit[]): VehicleCapacity {
  return aggregateQuantity(chits);
}

export function unloadedQuantityForChits(chits: readonly DispatchChit[]): VehicleCapacity {
  return aggregateQuantity(chits);
}

export function requiresChargingAction(chits: readonly DispatchChit[], assetIds: readonly string[]): boolean {
  return chits.some((chit) => chit.kind === "battery-support" || (chit.quantity.energyWh ?? 0) > 0) ||
    assetIds.some((assetId) => assetId.includes("battery"));
}

export function requiresMaintenanceAction(chits: readonly DispatchChit[]): boolean {
  return chits.some((chit) => chit.kind === "maintenance" || chit.kind === "maintenance-supplies");
}

function aggregateQuantity(chits: readonly DispatchChit[]): VehicleCapacity {
  return {
    passengers: optionalSum(chits, (chit) => chit.quantity.passengers),
    massKg: optionalSum(chits, (chit) => chit.quantity.massKg),
    volumeLiters: optionalSum(chits, (chit) => chit.quantity.volumeLiters),
    energyWh: optionalSum(chits, (chit) => chit.quantity.energyWh),
  };
}

function optionalSum<T>(values: readonly T[], read: (value: T) => number | undefined): number | undefined {
  const value = sum(values, read);
  return value > 0 ? value : undefined;
}

function sum<T>(values: readonly T[], read: (value: T) => number | undefined): number {
  return values.reduce((total, value) => total + (read(value) ?? 0), 0);
}
