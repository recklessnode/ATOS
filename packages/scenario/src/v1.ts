import type {
  Contract,
  IsoDateTimeString,
  ServiceZone,
  StableId,
  Station,
  UniversalChit,
  Vehicle,
} from "@atos/domain";
import type {
  ElectricalBranch,
  ElectricalIncompatibleConnection,
  ElectricalLoad,
  ElectricalNode,
  ElectricalOpenConnector,
  ElectricalSource,
  GuidewayComponent,
  GuidewayIncompatibleConnection,
  GuidewayLink,
  GuidewayNode,
  GuidewayOpenEnd,
  GuidewayServiceAttachment,
  PlacedTile,
  SetPieceInstance,
} from "@atos/layout";

export const SCENARIO_SCHEMA_VERSION = 1;

export type ScenarioDocumentV1 = {
  schemaVersion: 1;
  scenario: {
    id: StableId;
    title: string;
    description: string;
    createdAt: IsoDateTimeString;
    updatedAt: IsoDateTimeString;
  };
  randomSeed: string;
  layout: {
    scale: "tabletop";
    hex: {
      orientation: "pointy-top";
      radiusMm: number;
      edgeLengthMm: number;
    };
    tiles: PlacedTile[];
    setPieces: SetPieceInstance[];
  };
  guideway: {
    nodes: GuidewayNode[];
    links: GuidewayLink[];
    openEnds: GuidewayOpenEnd[];
    incompatibleConnections: GuidewayIncompatibleConnection[];
    disconnectedComponents: GuidewayComponent[];
    serviceAttachments: GuidewayServiceAttachment[];
  };
  stations: Station[];
  serviceZones: ServiceZone[];
  electrical: {
    nodes: ElectricalNode[];
    branches: ElectricalBranch[];
    sources: ElectricalSource[];
    loads: ElectricalLoad[];
    openConnectors: ElectricalOpenConnector[];
    incompatibleConnections: ElectricalIncompatibleConnection[];
  };
  inventory: {
    vehicles: Vehicle[];
  };
  contracts: Contract[];
  chits: UniversalChit[];
  simulation: {
    currentTime: IsoDateTimeString;
    tickSeconds: number;
    speedMultiplier: number;
    paused: boolean;
  };
};

export type ScenarioSummary = {
  title: string;
  schemaVersion: number;
  tileCount: number;
  guidewayNodeCount: number;
  guidewayLinkCount: number;
  electricalNodeCount: number;
  electricalBranchCount: number;
  electricalLoadCount: number;
  stationCount: number;
  serviceZoneCount: number;
  vehicleCount: number;
  openChitCount: number;
  validationState: "valid";
};

export function summarizeScenarioDocument(document: ScenarioDocumentV1): ScenarioSummary {
  return {
    title: document.scenario.title,
    schemaVersion: document.schemaVersion,
    tileCount: document.layout.tiles.length,
    guidewayNodeCount: document.guideway.nodes.length,
    guidewayLinkCount: document.guideway.links.length,
    electricalNodeCount: document.electrical.nodes.length,
    electricalBranchCount: document.electrical.branches.length,
    electricalLoadCount: document.electrical.loads.length,
    stationCount: document.stations.length,
    serviceZoneCount: document.serviceZones.length,
    vehicleCount: document.inventory.vehicles.length,
    openChitCount: document.chits.filter((chit) => chit.status === "unsatisfied").length,
    validationState: "valid",
  };
}
