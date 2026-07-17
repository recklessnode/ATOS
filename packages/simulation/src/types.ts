import type {
  DeficiencyGate,
  DispatchAsset,
  DispatchPlannerResult,
  DispatchReservation,
  MissionPlan,
  TransientSuperWorker,
} from "@atos/dispatch";
import type { IsoDateTimeString, StableId, VehicleCapacity } from "@atos/domain";
import type { ScenarioDocumentV1 } from "@atos/scenario";

export type SimulationClockStatus = "paused" | "running" | "completed";

export type SimulationClock = {
  currentTime: IsoDateTimeString;
  status: SimulationClockStatus;
  playbackSpeed: number;
  tickSeconds: number;
  processedEventCount: number;
  maxEventsPerAdvance: number;
};

export type MissionLifecycleState =
  | "planned"
  | "queued"
  | "forming"
  | "loading"
  | "ready"
  | "departing"
  | "in_transit"
  | "dwelling"
  | "unloading"
  | "servicing"
  | "completed"
  | "delayed"
  | "blocked"
  | "failed"
  | "cancelled";

export type SimulationEventSeverity = "info" | "warning" | "error";

export type SimulationEventStatus = "scheduled" | "applied" | "skipped";

export type SimulationEventType =
  | "mission_accepted"
  | "formation_started"
  | "formation_completed"
  | "loading_started"
  | "loading_completed"
  | "departure_requested"
  | "departure_authorized"
  | "departure_delayed"
  | "guideway_segment_entered"
  | "guideway_segment_exited"
  | "station_arrived"
  | "unloading_started"
  | "unloading_completed"
  | "consist_join_started"
  | "consist_join_completed"
  | "consist_split_started"
  | "consist_split_completed"
  | "charging_started"
  | "charging_completed"
  | "maintenance_started"
  | "maintenance_completed"
  | "mission_completed"
  | "mission_failed"
  | "reservation_conflict"
  | "route_blocked"
  | "power_gate_failed"
  | "battery_reserve_violated"
  | "fault_raised"
  | "fault_cleared"
  | "replanning_requested";

export type SimulationEventPayload = Record<string, string | number | boolean | string[] | number[] | null | undefined>;

export type SimulationEvent = {
  id: StableId;
  sequence: number;
  timestamp: IsoDateTimeString;
  type: SimulationEventType;
  missionId?: StableId;
  workerId?: StableId;
  transientWorkerId?: StableId;
  affectedAssetIds: StableId[];
  affectedResourceIds: StableId[];
  causalEventId?: StableId;
  payload: SimulationEventPayload;
  severity: SimulationEventSeverity;
  status: SimulationEventStatus;
};

export type RuntimeReservationStatus = "planned" | "held" | "active" | "released" | "conflict";

export type RuntimeReservation = {
  reservation: DispatchReservation;
  status: RuntimeReservationStatus;
  acquiredAt?: IsoDateTimeString;
  releasedAt?: IsoDateTimeString;
  conflictEventIds: StableId[];
};

export type RuntimeAssetHealth = "nominal" | "degraded" | "faulted" | "maintenance_due";

export type RuntimeAssetState = {
  assetId: StableId;
  label: string;
  kind: DispatchAsset["kind"];
  tileId?: StableId;
  nodeId?: StableId;
  serviceZoneId?: StableId;
  activeMissionId?: StableId;
  consistId?: StableId;
  battery?: {
    stateOfChargeWh: number;
    usableCapacityWh: number;
  };
  health: RuntimeAssetHealth;
  faultIds: StableId[];
  capacity: VehicleCapacity;
};

export type RuntimeConsistState = {
  id: StableId;
  superWorker: TransientSuperWorker;
  missionId: StableId;
  memberAssetIds: StableId[];
  status: "planned" | "forming" | "formed" | "splitting" | "dissolved";
  formedAt?: IsoDateTimeString;
  dissolvedAt?: IsoDateTimeString;
};

export type GuidewayOccupancy = {
  id: StableId;
  linkId: StableId;
  missionId: StableId;
  enteredAt: IsoDateTimeString;
  exitAt: IsoDateTimeString;
  assetIds: StableId[];
};

export type ServiceOccupancy = {
  id: StableId;
  resourceId: StableId;
  missionId: StableId;
  action:
    | "loading"
    | "unloading"
    | "charging"
    | "maintenance"
    | "formation"
    | "split";
  startTime: IsoDateTimeString;
  endTime: IsoDateTimeString;
  capacityUsed: number;
};

export type ChitFulfillmentProgress = {
  chitId: StableId;
  loaded: VehicleCapacity;
  unloaded: VehicleCapacity;
  status: "pending" | "loaded" | "satisfied" | "failed";
};

export type RuntimeMission = {
  plan: MissionPlan;
  state: MissionLifecycleState;
  currentNodeId?: StableId;
  currentLinkId?: StableId;
  routeIndex: number;
  startedAt?: IsoDateTimeString;
  completedAt?: IsoDateTimeString;
  delayedUntil?: IsoDateTimeString;
  energyConsumedWh: number;
  eventIds: StableId[];
  activeFaultIds: StableId[];
  chitProgress: ChitFulfillmentProgress[];
};

export type SimulationFaultType =
  | "vehicle_unavailable"
  | "low_battery"
  | "branch_power_limit"
  | "guideway_segment_blocked"
  | "switch_unavailable"
  | "station_service_unavailable"
  | "charger_unavailable"
  | "maintenance_due"
  | "consist_member_failure";

export type SimulationFaultBehavior = "delay" | "block" | "fail" | "request_replanning";

export type SimulationFault = {
  id: StableId;
  type: SimulationFaultType;
  targetId: StableId;
  startsAt: IsoDateTimeString;
  endsAt?: IsoDateTimeString;
  behavior: SimulationFaultBehavior;
  delaySeconds?: number;
  severity: SimulationEventSeverity;
  message: string;
};

export type ActiveFault = SimulationFault & {
  raisedEventId: StableId;
};

export type ReplanningRequest = {
  id: StableId;
  status: "requested";
  currentTime: IsoDateTimeString;
  triggeredByEventId: StableId;
  missionId?: StableId;
  chitIds: StableId[];
  affectedAssetIds: StableId[];
  releasedReservationIds: StableId[];
  retainedReservationIds: StableId[];
  assetStates: RuntimeAssetState[];
  reason: string;
  deficiency?: DeficiencyGate;
};

export type SimulationConfig = {
  tickSeconds: number;
  playbackSpeed: number;
  maxEventsPerAdvance: number;
  formationSeconds: number;
  splitSeconds: number;
  baseLoadingSeconds: number;
  baseUnloadingSeconds: number;
  passengerLoadSeconds: number;
  passengerUnloadSeconds: number;
  cargoKgLoadSeconds: number;
  cargoKgUnloadSeconds: number;
  dwellSeconds: number;
  internalLinkTravelSeconds: number;
  connectionLinkTravelSeconds: number;
  accelerationAllowanceSeconds: number;
  chargingPowerWatts: number;
  maintenanceSeconds: number;
  minimumBatteryReserveWh: number;
  propulsionWhPerInternalLink: number;
  propulsionWhPerConnectionLink: number;
  serviceEnergyWh: number;
  conflictRetrySeconds: number;
};

export type SimulationInput = {
  scenario: ScenarioDocumentV1;
  dispatchResult: DispatchPlannerResult;
  faultSchedule?: readonly SimulationFault[];
  config?: Partial<SimulationConfig>;
};

export type SimulationRuntimeState = {
  schemaVersion: 1;
  scenario: ScenarioDocumentV1;
  dispatchResult: DispatchPlannerResult;
  config: SimulationConfig;
  clock: SimulationClock;
  eventQueue: SimulationEvent[];
  eventHistory: SimulationEvent[];
  missions: RuntimeMission[];
  assets: RuntimeAssetState[];
  consists: RuntimeConsistState[];
  guidewayOccupancy: GuidewayOccupancy[];
  serviceOccupancy: ServiceOccupancy[];
  reservations: RuntimeReservation[];
  faults: ActiveFault[];
  faultSchedule: SimulationFault[];
  replanningRequests: ReplanningRequest[];
};

export type SimulationEventFilter = {
  missionId?: StableId;
  assetId?: StableId;
  eventType?: SimulationEventType;
  severity?: SimulationEventSeverity;
  resourceId?: StableId;
  fromTime?: IsoDateTimeString;
  toTime?: IsoDateTimeString;
  causalEventId?: StableId;
};
