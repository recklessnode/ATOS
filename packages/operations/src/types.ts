import type {
  DeficiencyGate,
  DispatchPlannerInput,
  DispatchPlannerResult,
  DispatchReservation,
  MissionPlan,
} from "@atos/dispatch";
import type { IsoDateTimeString, StableId } from "@atos/domain";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import type {
  ReplanningRequest,
  RuntimeAssetState,
  RuntimeReservation,
  SimulationEvent,
  SimulationRuntimeState,
} from "@atos/simulation";

export type ReplanningTriggerKind =
  | "mission_failure"
  | "route_blockage"
  | "reservation_conflict"
  | "asset_failure"
  | "battery_power_failure"
  | "power_launch_failure"
  | "service_outage"
  | "missed_deadline"
  | "material_queue_growth"
  | "released_high_priority_asset"
  | "operator_request"
  | "fault_cleared"
  | "completed_mission";

export type ReplanningMode = "none" | "deferred" | "partial" | "full";

export type ReplanningPolicyDecision = {
  id: StableId;
  requestId: StableId;
  trigger: ReplanningTriggerKind;
  mode: ReplanningMode;
  priority: "low" | "normal" | "high" | "critical";
  scopeMissionIds: StableId[];
  scopeChitIds: StableId[];
  scopeAssetIds: StableId[];
  deferUntil?: "mission_boundary" | "service_boundary";
  rationale: string;
};

export type OperationsReplanningRequest = ReplanningRequest & {
  source: "simulation" | "operator";
  trigger: ReplanningTriggerKind;
  operatorNote?: string;
};

export type ProjectedDispatchContext = {
  projectedScenario: ScenarioDocumentV1;
  dispatchInput: DispatchPlannerInput;
  runtimeAssetStates: RuntimeAssetState[];
  activeReservations: RuntimeReservation[];
  unavailableResourceIds: StableId[];
  activeConsistIds: StableId[];
  currentTime: IsoDateTimeString;
  powerConstraintIds: StableId[];
};

export type ReservationReconciliationRecord = {
  id: StableId;
  reservationId: StableId;
  resourceId: StableId;
  missionPlanId: StableId;
  status: "historical" | "retained" | "released" | "superseded" | "new" | "active_occupancy";
  reason: string;
};

export type ReservationConflictRecord = {
  id: StableId;
  resourceId: StableId;
  reservationIds: StableId[];
  reason: string;
};

export type ReservationReconciliationResult = {
  records: ReservationReconciliationRecord[];
  retainedReservationIds: StableId[];
  releasedReservationIds: StableId[];
  supersededReservationIds: StableId[];
  newReservationIds: StableId[];
  activeOccupancyResourceIds: StableId[];
  duplicateOwnershipConflicts: ReservationConflictRecord[];
};

export type MissionDiffStatus = "unchanged" | "delayed" | "cancelled" | "replacement" | "changed";

export type MissionPlanDiff = {
  id: StableId;
  status: MissionDiffStatus;
  previousMissionId?: StableId;
  revisedMissionId?: StableId;
  chitIds: StableId[];
  routeChanged: boolean;
  consistChanged: boolean;
  reservationsChanged: boolean;
  deadlineImpactMinutes: number;
  scoreDelta: number;
  powerChanged: boolean;
  energyChanged: boolean;
  rationale: string;
};

export type PlanDiffResult = {
  records: MissionPlanDiff[];
  unchangedMissionIds: StableId[];
  delayedMissionIds: StableId[];
  cancelledMissionIds: StableId[];
  replacementMissionIds: StableId[];
  newlySatisfiedChitIds: StableId[];
  newlyUnsatisfiedChitIds: StableId[];
  scoreDelta: number;
  rationale: string;
};

export type DeficiencyCarryForwardStatus =
  | "resolved"
  | "worsened"
  | "unchanged"
  | "superseded"
  | "transformed"
  | "new";

export type DeficiencyCarryForwardRecord = {
  id: StableId;
  previousDeficiencyId?: StableId;
  revisedDeficiencyId?: StableId;
  status: DeficiencyCarryForwardStatus;
  kind: DeficiencyGate["kind"];
  chitIds: StableId[];
  rationale: string;
};

export type InfrastructureFinding = {
  id: StableId;
  kind: DeficiencyGate["kind"];
  recurrenceCount: number;
  deficiencyIds: StableId[];
  affectedIds: StableId[];
  summary: string;
};

export type DeficiencyCarryForwardResult = {
  records: DeficiencyCarryForwardRecord[];
  infrastructureFindings: InfrastructureFinding[];
};

export type OperationsIncident = {
  id: StableId;
  requestId: StableId;
  triggeringEventIds: StableId[];
  affectedMissionIds: StableId[];
  affectedChitIds: StableId[];
  affectedAssetIds: StableId[];
  affectedResourceIds: StableId[];
  previousGenerationId: StableId;
  revisedGenerationId?: StableId;
  deficiencyIds: StableId[];
  resolutionState: "open" | "deferred" | "replanned" | "no_action" | "resolved";
  summary: string;
};

export type OperationsMetrics = {
  simulatedHours: number;
  replansPerSimulatedHour: number;
  missionCompletionRate: number;
  onTimeCompletionRate: number;
  averageQueueWaitMinutes: number;
  averagePassengerWaitMinutes: number;
  averageCargoLatenessMinutes: number;
  assetUtilization: number;
  emptyMovementShare: number;
  reservationConflictRate: number;
  energyDelayCount: number;
  missionFailuresByCause: Record<string, number>;
  deficiencyRecurrence: Record<string, number>;
  planningChurn: number;
};

export type PlanningGeneration = {
  id: StableId;
  generationNumber: number;
  createdAt: IsoDateTimeString;
  dispatchResult: DispatchPlannerResult;
  policyDecision?: ReplanningPolicyDecision;
  projection?: ProjectedDispatchContext;
  reservationReconciliation?: ReservationReconciliationResult;
  planDiff?: PlanDiffResult;
  deficiencyCarryForward?: DeficiencyCarryForwardResult;
};

export type OperationsSession = {
  schemaVersion: 1;
  sessionId: StableId;
  scenarioId: StableId;
  scenarioSchemaVersion: number;
  currentGenerationId: StableId;
  generations: PlanningGeneration[];
  runtime: SimulationRuntimeState;
  pendingRequests: OperationsReplanningRequest[];
  policyDecisions: ReplanningPolicyDecision[];
  reservationReconciliation: ReservationReconciliationResult;
  planDiff: PlanDiffResult;
  deficiencyCarryForward: DeficiencyCarryForwardResult;
  incidents: OperationsIncident[];
  metrics: OperationsMetrics;
};

export type OperationsSessionInput = {
  scenario: ScenarioDocumentV1;
  dispatchResult: DispatchPlannerResult;
  runtime: SimulationRuntimeState;
  sessionId?: StableId;
};

export type ManualReplanInput = {
  currentTime?: IsoDateTimeString;
  note?: string;
};

export type IncidentCorrelationInput = {
  sessionId: StableId;
  request: OperationsReplanningRequest;
  decision: ReplanningPolicyDecision;
  runtime: SimulationRuntimeState;
  previousGenerationId: StableId;
  revisedGenerationId?: StableId;
  planDiff?: PlanDiffResult;
  deficiencyCarryForward?: DeficiencyCarryForwardResult;
};

export type PlanDiffInput = {
  previous: DispatchPlannerResult;
  revised: DispatchPlannerResult;
};

export type ReservationReconciliationInput = {
  previousReservations: readonly DispatchReservation[];
  runtimeReservations: readonly RuntimeReservation[];
  revisedReservations: readonly DispatchReservation[];
  runtime: SimulationRuntimeState;
};

export type PolicyTriggerInput = {
  requestId: StableId;
  trigger: ReplanningTriggerKind;
  missionId?: StableId;
  chitIds?: readonly StableId[];
  affectedAssetIds?: readonly StableId[];
  affectedResourceIds?: readonly StableId[];
  reason?: string;
  deficiency?: DeficiencyGate;
  currentTime?: IsoDateTimeString;
  queueGrowthRatio?: number;
  priority?: number;
};

export type MissionPlanPair = {
  previous?: MissionPlan;
  revised?: MissionPlan;
};

export type EventCorrelationSource = Pick<
  SimulationEvent,
  "id" | "missionId" | "affectedAssetIds" | "affectedResourceIds" | "causalEventId"
>;
