import type {
  ChitPenalties,
  ChitQuantity,
  ChitRequirements,
  ContractEndpoint,
  IsoDateTimeString,
  StableId,
  VehicleCapacity,
  VehicleClass,
  VehicleState,
} from "@atos/domain";
import type { GuidewayLink, GuidewayNode, GuidewayServiceAttachment } from "@atos/layout";
import type {
  PowerAnalysisResult,
  PowerDiagnostic,
  PowerFinding,
  PowerNetworkInput,
  PowerPresetId,
  PowerRecommendation,
} from "@atos/power";
import type { ScenarioDocumentV1 } from "@atos/scenario";

export type DispatchChitKind =
  | "commuter-passenger"
  | "express-passenger"
  | "local-cargo"
  | "regional-cargo"
  | "long-haul-cargo"
  | "perishable-cargo"
  | "hazard-cargo"
  | "bulk-cargo"
  | "parcel-cargo"
  | "maintenance-supplies"
  | "battery-support"
  | "maintenance"
  | "infrastructure"
  | "repositioning";

export type PassengerServiceClass = "commuter" | "express";

export type CargoServiceClass =
  | "local"
  | "regional"
  | "long-haul"
  | "perishable"
  | "hazard"
  | "bulk"
  | "parcel"
  | "maintenance-supplies";

export type ChitCargoMetadata = {
  serviceClass: CargoServiceClass;
  hazardous: boolean;
  perishable: boolean;
};

export type ChitServiceMetadata = {
  passengerClass?: PassengerServiceClass;
  cargo?: ChitCargoMetadata;
  infrastructureRequired?: boolean;
};

export type DispatchChit = {
  id: StableId;
  sourceChitId?: StableId;
  contractId: StableId;
  kind: DispatchChitKind;
  status: "unsatisfied" | "candidate" | "reserved" | "active" | "satisfied" | "failed";
  origin: ContractEndpoint;
  destination: ContractEndpoint;
  readyAt: IsoDateTimeString;
  dueAt: IsoDateTimeString;
  priority: number;
  quantity: ChitQuantity;
  requirements: ChitRequirements;
  penalties: ChitPenalties;
  serviceMetadata: ChitServiceMetadata;
  rankScore: number;
};

export type DispatchAssetKind =
  | "vehicle"
  | "station"
  | "platform"
  | "depot"
  | "shed"
  | "charger"
  | "crane"
  | "forklift"
  | "switch"
  | "guideway"
  | "power-source"
  | "maintenance-bay";

export type DispatchAssetState = VehicleState | "offline";

export type DispatchAsset = {
  id: StableId;
  kind: DispatchAssetKind;
  label: string;
  persistent: true;
  state: DispatchAssetState;
  tileId?: StableId;
  stationId?: StableId;
  serviceZoneId?: StableId;
  vehicleClass?: VehicleClass;
  capabilities: StableId[];
  capacity: VehicleCapacity;
  battery?: {
    stateOfChargeWh: number;
    usableCapacityWh: number;
  };
};

export type WorkerKind = "atomic" | "composite" | "station" | "transient-super-worker";

export type DispatchWorker = {
  id: StableId;
  kind: WorkerKind;
  label: string;
  assetIds: StableId[];
  stationId?: StableId;
  serviceZoneId?: StableId;
  tileId?: StableId;
  state: DispatchAssetState;
  capabilities: StableId[];
  capacity: VehicleCapacity;
  source: "vehicle" | "station-zone" | "synthetic-station" | "transient";
};

export type CapabilityMatch = {
  eligible: boolean;
  score: number;
  reasons: string[];
  missingCapabilities: StableId[];
  forbiddenCapabilities: StableId[];
  capacityDeficits: string[];
  compatibilityWarnings: string[];
};

export type GuidewayRoute = {
  originNodeId: StableId;
  destinationNodeId: StableId;
  pathNodeIds: StableId[];
  linkIds: StableId[];
  hopCount: number;
  cost: number;
  reachable: boolean;
};

export type PowerLaunchStatus = "allowed" | "delayed" | "blocked";

export type PowerLaunchGate = {
  status: PowerLaunchStatus;
  message: string;
  reasonCodes: StableId[];
  networkState: PowerAnalysisResult["metrics"]["networkState"];
  affectedPowerIds: StableId[];
  supportAssetIds: StableId[];
};

export type DispatchScoreBreakdown = {
  priority: number;
  deadlineUrgency: number;
  routeEfficiency: number;
  capabilityFit: number;
  capacityHeadroom: number;
  powerReadiness: number;
  reservationPenalty: number;
  total: number;
};

export type TransientSuperWorker = {
  id: StableId;
  kind: "transient-super-worker";
  label: string;
  chitIds: StableId[];
  workerIds: StableId[];
  assetIds: StableId[];
  capabilities: StableId[];
  capacity: VehicleCapacity;
  primaryWorkerId: StableId;
  supportWorkerIds: StableId[];
  formationReason: string;
};

export type DispatchReservationType =
  | "asset"
  | "guideway-link"
  | "station-zone"
  | "power-window";

export type DispatchReservation = {
  id: StableId;
  missionPlanId: StableId;
  resourceType: DispatchReservationType;
  resourceId: StableId;
  startTime: IsoDateTimeString;
  endTime: IsoDateTimeString;
  chitIds: StableId[];
};

export type MissionPlanStep = {
  id: StableId;
  label: string;
  resourceIds: StableId[];
};

export type MissionPlan = {
  id: StableId;
  chitId: StableId;
  state: "planned" | "delayed";
  superWorkerId: StableId;
  workerIds: StableId[];
  assetIds: StableId[];
  route: GuidewayRoute;
  launchGate: PowerLaunchGate;
  reservationIds: StableId[];
  score: DispatchScoreBreakdown;
  startsAt: IsoDateTimeString;
  endsAt: IsoDateTimeString;
  steps: MissionPlanStep[];
};

export type DeficiencyKind =
  | "missing_capability"
  | "insufficient_capacity"
  | "route_unreachable"
  | "power_blocked"
  | "power_delayed"
  | "asset_unavailable"
  | "service_zone_full"
  | "incompatible_group"
  | "reservation_conflict"
  | "maintenance_required"
  | "state_of_charge"
  | "no_candidate";

export type DeficiencyGate = {
  id: StableId;
  kind: DeficiencyKind;
  severity: "info" | "warning" | "error";
  message: string;
  action: string;
  chitIds: StableId[];
  assetIds: StableId[];
  affectedIds: StableId[];
};

export type InfrastructureRecommendation = {
  id: StableId;
  priority: number;
  kind:
    | "add_vehicle"
    | "add_service_asset"
    | "add_guideway"
    | "add_power_source"
    | "reinforce_power"
    | "expand_service_zone"
    | "stage_asset";
  action: string;
  rationale: string;
  deficiencyIds: StableId[];
  affectedIds: StableId[];
};

export type DispatchPlannerOptions = {
  currentTime?: IsoDateTimeString;
  generatedChits?: readonly DispatchChit[];
  powerPreset?: PowerPresetId;
  demandSeed?: string;
};

export type DispatchPlannerInput = {
  scenario: ScenarioDocumentV1;
  guideway: {
    nodes: readonly GuidewayNode[];
    links: readonly GuidewayLink[];
    serviceAttachments: readonly GuidewayServiceAttachment[];
  };
  electrical: PowerNetworkInput;
  powerAnalysis?: PowerAnalysisResult;
  options?: DispatchPlannerOptions;
};

export type DispatchCandidate = {
  chitId: StableId;
  workerId: StableId;
  supportWorkerIds: StableId[];
  assetIds: StableId[];
  match: CapabilityMatch;
  route: GuidewayRoute;
  launchGate: PowerLaunchGate;
  score: DispatchScoreBreakdown;
};

export type DispatchPlannerResult = {
  schemaVersion: 1;
  generatedAt: IsoDateTimeString;
  normalizedChits: DispatchChit[];
  assets: DispatchAsset[];
  workers: DispatchWorker[];
  candidates: DispatchCandidate[];
  transientSuperWorkers: TransientSuperWorker[];
  reservations: DispatchReservation[];
  missionPlans: MissionPlan[];
  deficiencyGates: DeficiencyGate[];
  recommendations: InfrastructureRecommendation[];
  scoreBreakdown: DispatchScoreBreakdown;
  powerGateSummary: {
    status: PowerLaunchStatus;
    networkState: PowerLaunchGate["networkState"];
    delayedCount: number;
    blockedCount: number;
    diagnostics: PowerDiagnostic[];
    findings: PowerFinding[];
    recommendations: PowerRecommendation[];
  };
};
