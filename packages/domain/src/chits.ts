import type { ContractEndpoint, ContractKind } from "./contracts";
import type { IsoDateTimeString, StableId } from "./identifiers";

export type ChitStatus =
  | "unsatisfied"
  | "candidate"
  | "reserved"
  | "active"
  | "satisfied"
  | "failed";

export type ChitQuantity = {
  passengers?: number;
  massKg?: number;
  volumeLiters?: number;
  energyWh?: number;
};

export type ChitRequirements = {
  requiredVehicleClasses: StableId[];
  forbiddenVehicleClasses?: StableId[];
  requiredCapabilities: StableId[];
  stopSensitivity: "normal" | "express" | "direct";
};

export type ChitPenalties = {
  waitPerMinute: number;
  latePerMinute: number;
  transfer: number;
  handling: number;
};

export type UniversalChit = {
  id: StableId;
  contractId: StableId;
  kind: ContractKind;
  status: ChitStatus;
  origin: ContractEndpoint;
  destination: ContractEndpoint;
  readyAt: IsoDateTimeString;
  dueAt: IsoDateTimeString;
  priority: number;
  quantity: ChitQuantity;
  requirements: ChitRequirements;
  penalties: ChitPenalties;
};
