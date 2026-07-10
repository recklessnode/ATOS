import type { IsoDateTimeString, StableId } from "./identifiers";

export type ContractKind =
  | "commuter-passenger"
  | "express-passenger"
  | "local-cargo"
  | "battery-support";

export type ContractStatus = "open" | "partially-satisfied" | "satisfied" | "failed";

export type ContractEndpoint = {
  stationId: StableId;
  serviceZoneId?: StableId;
};

export type Contract = {
  id: StableId;
  kind: ContractKind;
  title: string;
  status: ContractStatus;
  origin: ContractEndpoint;
  destination: ContractEndpoint;
  requestedAt: IsoDateTimeString;
  dueAt: IsoDateTimeString;
  priority: number;
};
