import type { ServiceZoneType, StableId } from "@atos/domain";
import type { TileEdgeDefinition } from "./connectors";
import type { EdgeIndex } from "./hex";

export type PlacementConstraint = {
  type: "requires-adjacent-guideway" | "requires-station" | "none";
  description: string;
};

export type LocalGuidewayNode = {
  id: StableId;
  label: string;
};

export type LocalGuidewayLink = {
  id: StableId;
  fromNodeId: StableId;
  toNodeId: StableId;
};

export type LocalGuidewayEdgePort = {
  id: StableId;
  edge: EdgeIndex;
  nodeId: StableId;
};

export type GuidewayTopologyDefinition = {
  nodes: LocalGuidewayNode[];
  links: LocalGuidewayLink[];
  edgePorts: LocalGuidewayEdgePort[];
};

export type LocalElectricalNode = {
  id: StableId;
  label: string;
};

export type LocalConductorDefinition = {
  id: StableId;
  fromNodeId: StableId;
  toNodeId: StableId;
  resistanceOhms: number;
  currentLimitAmps: number;
  enabled: boolean;
};

export type LocalElectricalEdgePort = {
  id: StableId;
  edge: EdgeIndex;
  nodeId: StableId;
};

export type LocalPowerSourceDefinition = {
  id: StableId;
  nodeId: StableId;
  nominalVoltage: number;
  maximumWatts: number;
};

export type LoadClass =
  | "propulsion"
  | "control"
  | "safety"
  | "passenger"
  | "cargo"
  | "charging"
  | "effects";

export type LocalElectricalLoadDefinition = {
  id: StableId;
  nodeId: StableId;
  requestedWatts: number;
  minimumVoltage: number;
  loadClass: LoadClass;
  sheddingPriority: number;
};

export type ElectricalContributionDefinition = {
  nodes: LocalElectricalNode[];
  conductors: LocalConductorDefinition[];
  edgePorts: LocalElectricalEdgePort[];
  sources: LocalPowerSourceDefinition[];
  loads: LocalElectricalLoadDefinition[];
};

export type TileDefinition = {
  type: StableId;
  version: number;
  label: string;
  tags: string[];
  edges: TileEdgeDefinition[];
  guideway: GuidewayTopologyDefinition;
  electrical: ElectricalContributionDefinition;
  allowedSetPieceTypes: StableId[];
  builtInSetPieceTypes: StableId[];
  constraints: PlacementConstraint[];
};

export type SetPieceVisualIdentity = {
  label: string;
  category: "station" | "platform" | "depot" | "energy" | "utility" | "scenery";
};

export type SetPieceServiceContribution = {
  serviceZoneType: ServiceZoneType;
  capacity: number;
};

export type SetPieceDefinition = {
  type: StableId;
  version: number;
  visual: SetPieceVisualIdentity;
  tags: string[];
  electrical: {
    loads: LocalElectricalLoadDefinition[];
    sources: LocalPowerSourceDefinition[];
  };
  service?: SetPieceServiceContribution;
  dispatchCapacity?: {
    assetSlots: number;
    parallelJobs: number;
  };
  constraints: PlacementConstraint[];
};

export type SetPieceInstance = {
  id: StableId;
  type: StableId;
  version: number;
  tileId: StableId;
  localGuidewayNodeId?: StableId;
  localElectricalNodeId?: StableId;
};
