import type { StableId } from "./identifiers";

export type ServiceZoneType =
  | "passenger-platform"
  | "cargo-depot"
  | "charging-siding"
  | "maintenance"
  | "staging";

export type GuidewayAttachment = {
  tileId: StableId;
  localGuidewayNodeId: StableId;
};

export type Station = {
  id: StableId;
  label: string;
  tileId: StableId;
  guidewayAttachment: GuidewayAttachment;
  serviceZoneIds: StableId[];
};

export type ServiceZone = {
  id: StableId;
  stationId: StableId;
  type: ServiceZoneType;
  label: string;
  capacity: number;
  guidewayAttachment: GuidewayAttachment;
};
