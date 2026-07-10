import type { StableId } from "./identifiers";

export type VehicleClass =
  | "commuter-passenger"
  | "express-passenger"
  | "cargo"
  | "battery-support";

export type VehicleState = "available" | "reserved" | "active" | "maintenance";

export type VehicleCapacity = {
  passengers?: number;
  massKg?: number;
  volumeLiters?: number;
  energyWh?: number;
};

export type Vehicle = {
  id: StableId;
  label: string;
  vehicleClass: VehicleClass;
  state: VehicleState;
  homeStationId: StableId;
  currentTileId: StableId;
  capabilities: StableId[];
  capacity: VehicleCapacity;
  battery: {
    stateOfChargeWh: number;
    usableCapacityWh: number;
  };
};
