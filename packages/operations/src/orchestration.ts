import {
  planDispatch,
  type DispatchChit,
  type DispatchPlannerInput,
  type DispatchPlannerResult,
  type DispatchReservation,
  type DispatchScoreBreakdown,
  type MissionPlan,
} from "@atos/dispatch";
import type { StableId } from "@atos/domain";
import {
  createSimulationFixture,
  initializeSimulation,
  orderedEventQueue,
  stepSimulationToNextEvent,
  type ChitFulfillmentProgress,
  type RuntimeAssetState,
  type RuntimeConsistState,
  type RuntimeMission,
  type RuntimeReservation,
  type SimulationEvent,
  type SimulationRuntimeState,
} from "@atos/simulation";
import { carryForwardDeficiencies } from "./deficiency-carry-forward";
import { correlateIncident } from "./incident-correlation";
import { calculateOperationsMetrics } from "./metrics";
import { diffDispatchPlans } from "./plan-diff";
import { policyDecisionForRequest, triggerFromSimulationRequest } from "./replanning-policy";
import { reconcileReservations } from "./reservation-reconciliation";
import { projectRuntimeStateToDispatchInput } from "./state-projection";
import type {
  ManualReplanInput,
  OperationsReplanningRequest,
  OperationsSession,
  OperationsSessionInput,
  PlanningGeneration,
  ReservationReconciliationResult,
  PlanDiffResult,
  DeficiencyCarryForwardResult,
} from "./types";

export function createOperationsSession(input: OperationsSessionInput): OperationsSession {
  const sessionId = input.sessionId ?? `operations:${input.scenario.scenario.id}`;
  const generation = generationFor(sessionId, 0, input.runtime.clock.currentTime, input.dispatchResult);
  const pendingRequests = input.runtime.replanningRequests.map(simulationRequestToOperationsRequest);
  const policyDecisions = pendingRequests.map(policyDecisionForRequest);
  const reservationReconciliation = emptyReservationReconciliation();
  const planDiff = emptyPlanDiff();
  const deficiencyCarryForward = {
    records: [],
    infrastructureFindings: [],
  };
  return {
    schemaVersion: 1,
    sessionId,
    scenarioId: input.scenario.scenario.id,
    scenarioSchemaVersion: input.scenario.schemaVersion,
    currentGenerationId: generation.id,
    generations: [generation],
    runtime: input.runtime,
    pendingRequests,
    policyDecisions,
    reservationReconciliation,
    planDiff,
    deficiencyCarryForward,
    incidents: pendingRequests.map((request, index) => correlateIncident({
      sessionId,
      request,
      decision: policyDecisions[index] ?? policyDecisionForRequest(request),
      runtime: input.runtime,
      previousGenerationId: generation.id,
    })),
    metrics: calculateOperationsMetrics(input.runtime, [generation], pendingRequests.length),
  };
}

export function createDefaultOperationsSession(): OperationsSession {
  const input = createSimulationFixture("asset-fault-replanning");
  let runtime = initializeSimulation(input);
  for (let index = 0; index < 24 && runtime.replanningRequests.length === 0; index += 1) {
    runtime = stepSimulationToNextEvent(runtime);
  }
  return createOperationsSession({
    scenario: input.scenario,
    dispatchResult: input.dispatchResult,
    runtime,
  });
}

export function requestManualReplan(
  session: OperationsSession,
  input: ManualReplanInput = {},
): OperationsSession {
  const request = createManualReplanningRequest(session, input);
  const pendingRequests = [...session.pendingRequests, request].sort((left, right) => left.id.localeCompare(right.id));
  const policyDecision = policyDecisionForRequest(request);
  return {
    ...session,
    pendingRequests,
    policyDecisions: [...session.policyDecisions, policyDecision].sort((left, right) => left.id.localeCompare(right.id)),
    incidents: [
      ...session.incidents,
      correlateIncident({
        sessionId: session.sessionId,
        request,
        decision: policyDecision,
        runtime: session.runtime,
        previousGenerationId: session.currentGenerationId,
      }),
    ].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function performOperationsReplan(
  session: OperationsSession,
  requestId = session.pendingRequests[0]?.id,
): OperationsSession {
  const request = session.pendingRequests.find((candidate) => candidate.id === requestId);
  if (!request) {
    return session;
  }
  const decision = policyDecisionForRequest(request);
  if (decision.mode === "none" || decision.mode === "deferred") {
    return {
      ...session,
      policyDecisions: upsertPolicyDecision(session.policyDecisions, decision),
      incidents: upsertIncident(session, request, decision),
    };
  }

  const previousGeneration = currentGeneration(session);
  const projection = projectRuntimeStateToDispatchInput(session.runtime);
  const plannerInput = dispatchInputForDecision(projection.dispatchInput, previousGeneration.dispatchResult, decision);
  const planningProjection = { ...projection, dispatchInput: plannerInput };
  const plannedDispatch = planDispatch(plannerInput);
  const revisedDispatch = decision.mode === "partial"
    ? mergePartialDispatchResult(previousGeneration.dispatchResult, plannedDispatch, decision)
    : plannedDispatch;
  const generation = generationFor(
    session.sessionId,
    previousGeneration.generationNumber + 1,
    session.runtime.clock.currentTime,
    revisedDispatch,
    decision,
    planningProjection,
  );
  const reservationReconciliation = reconcileReservations({
    previousReservations: previousGeneration.dispatchResult.reservations,
    runtimeReservations: session.runtime.reservations,
    revisedReservations: revisedDispatch.reservations,
    runtime: session.runtime,
  });
  const planDiff = diffDispatchPlans({
    previous: previousGeneration.dispatchResult,
    revised: revisedDispatch,
  });
  const deficiencyCarryForward = carryForwardDeficiencies(
    previousGeneration.dispatchResult.deficiencyGates,
    revisedDispatch.deficiencyGates,
  );
  const finalizedGeneration: PlanningGeneration = {
    ...generation,
    reservationReconciliation,
    planDiff,
    deficiencyCarryForward,
  };
  const generations = [...session.generations, finalizedGeneration].sort((left, right) => left.generationNumber - right.generationNumber);
  const promotionBlocked = reservationReconciliation.duplicateOwnershipConflicts.length > 0;
  const runtime = promotionBlocked
    ? session.runtime
    : handoffRuntimeToGeneration(session.runtime, projection.projectedScenario, revisedDispatch, request.id);

  return {
    ...session,
    currentGenerationId: promotionBlocked ? session.currentGenerationId : finalizedGeneration.id,
    generations,
    runtime,
    pendingRequests: promotionBlocked
      ? session.pendingRequests
      : session.pendingRequests.filter((candidate) => candidate.id !== request.id),
    policyDecisions: upsertPolicyDecision(session.policyDecisions, decision),
    reservationReconciliation,
    planDiff,
    deficiencyCarryForward,
    incidents: upsertIncident(
      session,
      request,
      decision,
      promotionBlocked ? undefined : finalizedGeneration.id,
      planDiff,
      deficiencyCarryForward,
    ),
    metrics: calculateOperationsMetrics(runtime, generations, session.policyDecisions.length + 1),
  };
}

function dispatchInputForDecision(
  input: DispatchPlannerInput,
  previous: DispatchPlannerResult,
  decision: import("./types").ReplanningPolicyDecision,
): DispatchPlannerInput {
  const runtimeConstraints = input.options?.runtimeConstraints ?? {};
  if (decision.mode !== "partial") {
    return input;
  }

  const scopedChitIds = new Set(decision.scopeChitIds);
  const scopedMissionIds = new Set(decision.scopeMissionIds);
  const retainedPreviousReservations = previous.reservations.filter((reservation) =>
    !scopedMissionIds.has(reservation.missionPlanId) &&
    !reservation.chitIds.some((chitId) => scopedChitIds.has(chitId))
  );
  return {
    ...input,
    options: {
      ...input.options,
      runtimeConstraints: {
        ...runtimeConstraints,
        allowedChitIds: [...scopedChitIds].sort(),
        retainedReservations: uniqueReservations([
          ...(runtimeConstraints.retainedReservations ?? []),
          ...retainedPreviousReservations,
        ]),
      },
    },
  };
}

function mergePartialDispatchResult(
  previous: DispatchPlannerResult,
  partial: DispatchPlannerResult,
  decision: import("./types").ReplanningPolicyDecision,
): DispatchPlannerResult {
  const scopedChitIds = new Set(decision.scopeChitIds);
  const scopedMissionIds = new Set(decision.scopeMissionIds);
  const affectedPlan = (plan: MissionPlan) =>
    scopedMissionIds.has(plan.id) || plan.chitIds.some((chitId) => scopedChitIds.has(chitId));
  const preservedMissionPlans = previous.missionPlans.filter((plan) => !affectedPlan(plan));
  const preservedMissionIds = new Set(preservedMissionPlans.map((plan) => plan.id));
  const preservedSuperWorkerIds = new Set(preservedMissionPlans.map((plan) => plan.superWorkerId));
  const preservedDeficiencies = previous.deficiencyGates.filter((gate) =>
    !gate.chitIds.some((chitId) => scopedChitIds.has(chitId))
  );
  const normalizedChits = mergeChits(previous.normalizedChits, partial.normalizedChits, scopedChitIds);
  const missionPlans = [...preservedMissionPlans, ...partial.missionPlans].sort(compareById);
  const transientSuperWorkers = [
    ...previous.transientSuperWorkers.filter((worker) => preservedSuperWorkerIds.has(worker.id)),
    ...partial.transientSuperWorkers,
  ].filter(uniqueById).sort(compareById);
  const reservations = uniqueReservations([
    ...previous.reservations.filter((reservation) => preservedMissionIds.has(reservation.missionPlanId)),
    ...partial.reservations,
  ]);
  const deficiencyGates = [
    ...preservedDeficiencies,
    ...partial.deficiencyGates,
  ].filter(uniqueById).sort(compareById);

  return {
    ...partial,
    normalizedChits,
    transientSuperWorkers,
    reservations,
    missionPlans,
    deficiencyGates,
    scoreBreakdown: aggregateScores(missionPlans),
    powerGateSummary: {
      ...partial.powerGateSummary,
      status: aggregatePowerStatus(missionPlans, partial.powerGateSummary.status),
      delayedCount: missionPlans.filter((plan) => plan.launchGate.status === "delayed").length,
      blockedCount: missionPlans.filter((plan) => plan.launchGate.status === "blocked").length,
    },
  };
}

function mergeChits(
  previous: readonly DispatchChit[],
  partial: readonly DispatchChit[],
  scopedChitIds: ReadonlySet<StableId>,
): DispatchChit[] {
  const partialById = new Map(partial.map((chit) => [chit.id, chit]));
  return [
    ...previous
      .filter((chit) => !scopedChitIds.has(chit.id))
      .map((chit) => ({ ...chit })),
    ...partialById.values(),
  ].sort(compareById);
}

function handoffRuntimeToGeneration(
  runtime: SimulationRuntimeState,
  scenario: import("@atos/scenario").ScenarioDocumentV1,
  dispatchResult: DispatchPlannerResult,
  resolvedRequestId: StableId,
): SimulationRuntimeState {
  const fresh = initializeSimulation({
    scenario,
    dispatchResult,
    config: runtime.config,
    faultSchedule: runtime.faultSchedule,
  });
  const currentTimeMs = Date.parse(runtime.clock.currentTime);
  const revisedMissionIds = new Set(dispatchResult.missionPlans.map((plan) => plan.id));
  const runtimeMissionById = new Map(runtime.missions.map((mission) => [mission.plan.id, mission]));
  const runtimeConsistByMission = new Map(runtime.consists.map((consist) => [consist.missionId, consist]));

  return {
    ...fresh,
    clock: runtime.clock,
    eventQueue: handoffEventQueue(runtime.eventQueue, fresh.eventQueue, revisedMissionIds, currentTimeMs),
    eventHistory: runtime.eventHistory,
    missions: fresh.missions.map((mission) => mergeRuntimeMission(mission, runtimeMissionById.get(mission.plan.id))).sort(compareMission),
    assets: fresh.assets.map((asset) => mergeRuntimeAsset(asset, runtime.assets, revisedMissionIds)).sort(compareRuntimeAsset),
    consists: fresh.consists.map((consist) => mergeRuntimeConsist(consist, runtimeConsistByMission.get(consist.missionId))).sort(compareConsist),
    guidewayOccupancy: runtime.guidewayOccupancy
      .filter((occupancy) => revisedMissionIds.has(occupancy.missionId))
      .sort(compareById),
    serviceOccupancy: runtime.serviceOccupancy
      .filter((occupancy) => revisedMissionIds.has(occupancy.missionId))
      .sort(compareById),
    reservations: mergeRuntimeReservations(fresh.reservations, runtime.reservations, revisedMissionIds),
    faults: runtime.faults,
    faultSchedule: runtime.faultSchedule,
    replanningRequests: runtime.replanningRequests.filter((request) => request.id !== resolvedRequestId),
  };
}

function handoffEventQueue(
  existing: readonly SimulationEvent[],
  fresh: readonly SimulationEvent[],
  revisedMissionIds: ReadonlySet<StableId>,
  currentTimeMs: number,
): SimulationEvent[] {
  return orderedEventQueue([
    ...existing.filter((event) =>
      event.missionId &&
      revisedMissionIds.has(event.missionId) &&
      Date.parse(event.timestamp) >= currentTimeMs
    ),
    ...fresh.filter((event) => Date.parse(event.timestamp) >= currentTimeMs),
  ].filter(uniqueById));
}

function mergeRuntimeMission(fresh: RuntimeMission, existing: RuntimeMission | undefined): RuntimeMission {
  if (!existing || !preserveRuntimeMissionState(existing)) {
    return fresh;
  }
  return {
    ...existing,
    plan: fresh.plan,
    chitProgress: fresh.chitProgress.map((progress) =>
      mergeChitProgress(progress, existing.chitProgress.find((candidate) => candidate.chitId === progress.chitId))
    ),
  };
}

function mergeChitProgress(
  fresh: ChitFulfillmentProgress,
  existing: ChitFulfillmentProgress | undefined,
): ChitFulfillmentProgress {
  return existing ? { ...fresh, ...existing } : fresh;
}

function mergeRuntimeAsset(
  fresh: RuntimeAssetState,
  existingAssets: readonly RuntimeAssetState[],
  revisedMissionIds: ReadonlySet<StableId>,
): RuntimeAssetState {
  const existing = existingAssets.find((asset) => asset.assetId === fresh.assetId);
  if (!existing) {
    return fresh;
  }
  return {
    ...fresh,
    tileId: existing.tileId ?? fresh.tileId,
    nodeId: existing.nodeId ?? fresh.nodeId,
    battery: existing.battery ? { ...existing.battery } : fresh.battery,
    health: existing.health,
    faultIds: [...existing.faultIds].sort(),
    activeMissionId: existing.activeMissionId && revisedMissionIds.has(existing.activeMissionId)
      ? existing.activeMissionId
      : undefined,
    consistId: existing.activeMissionId && revisedMissionIds.has(existing.activeMissionId)
      ? existing.consistId
      : undefined,
  };
}

function mergeRuntimeConsist(
  fresh: RuntimeConsistState,
  existing: RuntimeConsistState | undefined,
): RuntimeConsistState {
  if (!existing || existing.status === "dissolved") {
    return fresh;
  }
  return {
    ...fresh,
    status: existing.status,
    formedAt: existing.formedAt,
    dissolvedAt: existing.dissolvedAt,
  };
}

function mergeRuntimeReservations(
  fresh: readonly RuntimeReservation[],
  existing: readonly RuntimeReservation[],
  revisedMissionIds: ReadonlySet<StableId>,
): RuntimeReservation[] {
  const byId = new Map(fresh.map((reservation) => [reservation.reservation.id, reservation]));
  for (const reservation of existing) {
    if (
      revisedMissionIds.has(reservation.reservation.missionPlanId) &&
      (reservation.status === "active" || reservation.status === "held")
    ) {
      byId.set(reservation.reservation.id, reservation);
    }
  }
  return [...byId.values()].sort((left, right) => left.reservation.id.localeCompare(right.reservation.id));
}

function uniqueReservations(reservations: readonly DispatchReservation[]): DispatchReservation[] {
  return [...new Map(reservations.map((reservation) => [reservation.id, { ...reservation }])).values()]
    .sort(compareById);
}

function aggregateScores(missionPlans: readonly MissionPlan[]): DispatchScoreBreakdown {
  if (missionPlans.length === 0) {
    return {
      priority: 0,
      deadlineUrgency: 0,
      routeEfficiency: 0,
      capabilityFit: 0,
      capacityHeadroom: 0,
      powerReadiness: 0,
      reservationPenalty: 0,
      total: 0,
    };
  }
  return {
    priority: average(missionPlans, (plan) => plan.score.priority),
    deadlineUrgency: average(missionPlans, (plan) => plan.score.deadlineUrgency),
    routeEfficiency: average(missionPlans, (plan) => plan.score.routeEfficiency),
    capabilityFit: average(missionPlans, (plan) => plan.score.capabilityFit),
    capacityHeadroom: average(missionPlans, (plan) => plan.score.capacityHeadroom),
    powerReadiness: average(missionPlans, (plan) => plan.score.powerReadiness),
    reservationPenalty: average(missionPlans, (plan) => plan.score.reservationPenalty),
    total: average(missionPlans, (plan) => plan.score.total),
  };
}

function aggregatePowerStatus(
  missionPlans: readonly MissionPlan[],
  fallback: DispatchPlannerResult["powerGateSummary"]["status"],
): DispatchPlannerResult["powerGateSummary"]["status"] {
  if (missionPlans.some((plan) => plan.launchGate.status === "blocked")) {
    return "blocked";
  }
  if (missionPlans.some((plan) => plan.launchGate.status === "delayed")) {
    return "delayed";
  }
  return fallback;
}

function preserveRuntimeMissionState(mission: RuntimeMission): boolean {
  return [
    "queued",
    "forming",
    "loading",
    "ready",
    "departing",
    "in_transit",
    "dwelling",
    "unloading",
    "servicing",
    "delayed",
  ].includes(mission.state);
}

function average<T>(values: readonly T[], select: (value: T) => number): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + select(value), 0) / values.length;
}

function uniqueById<T extends { id: StableId }>(value: T, index: number, values: readonly T[]): boolean {
  return values.findIndex((candidate) => candidate.id === value.id) === index;
}

function compareById<T extends { id: StableId }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function compareMission(left: RuntimeMission, right: RuntimeMission): number {
  return left.plan.id.localeCompare(right.plan.id);
}

function compareRuntimeAsset(left: RuntimeAssetState, right: RuntimeAssetState): number {
  return left.assetId.localeCompare(right.assetId);
}

function compareConsist(left: RuntimeConsistState, right: RuntimeConsistState): number {
  return left.id.localeCompare(right.id);
}

function simulationRequestToOperationsRequest(request: import("@atos/simulation").ReplanningRequest): OperationsReplanningRequest {
  return {
    ...request,
    source: "simulation",
    trigger: triggerFromSimulationRequest({
      reason: request.reason,
      deficiency: request.deficiency,
    }),
  };
}

function createManualReplanningRequest(
  session: OperationsSession,
  input: ManualReplanInput,
): OperationsReplanningRequest {
  const generation = currentGeneration(session);
  const currentTime = input.currentTime ?? session.runtime.clock.currentTime;
  return {
    id: `replan:${session.sessionId}:manual:${generation.generationNumber + 1}`,
    source: "operator",
    trigger: "operator_request",
    status: "requested",
    currentTime,
    triggeredByEventId: `operator:manual:${generation.generationNumber + 1}`,
    chitIds: generation.dispatchResult.normalizedChits
      .filter((chit) => chit.status !== "satisfied")
      .map((chit) => chit.id)
      .sort(),
    affectedAssetIds: [],
    releasedReservationIds: [],
    retainedReservationIds: session.runtime.reservations
      .filter((reservation) => reservation.status === "active" || reservation.status === "held")
      .map((reservation) => reservation.reservation.id)
      .sort(),
    assetStates: session.runtime.assets.slice().sort((left, right) => left.assetId.localeCompare(right.assetId)),
    reason: input.note ?? "Operator requested a deterministic manual replan.",
    operatorNote: input.note,
  };
}

function generationFor(
  sessionId: string,
  generationNumber: number,
  createdAt: string,
  dispatchResult: import("@atos/dispatch").DispatchPlannerResult,
  policyDecision?: import("./types").ReplanningPolicyDecision,
  projection?: import("./types").ProjectedDispatchContext,
): PlanningGeneration {
  return {
    id: `planning-generation:${sessionId}:${generationNumber}`,
    generationNumber,
    createdAt,
    dispatchResult,
    policyDecision,
    projection,
  };
}

function currentGeneration(session: OperationsSession): PlanningGeneration {
  return session.generations.find((generation) => generation.id === session.currentGenerationId) ?? session.generations.at(-1) as PlanningGeneration;
}

function upsertPolicyDecision(
  decisions: readonly import("./types").ReplanningPolicyDecision[],
  decision: import("./types").ReplanningPolicyDecision,
): import("./types").ReplanningPolicyDecision[] {
  return [
    ...decisions.filter((candidate) => candidate.id !== decision.id),
    decision,
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function upsertIncident(
  session: OperationsSession,
  request: OperationsReplanningRequest,
  decision: import("./types").ReplanningPolicyDecision,
  revisedGenerationId?: string,
  planDiff?: PlanDiffResult,
  deficiencyCarryForward?: DeficiencyCarryForwardResult,
): import("./types").OperationsIncident[] {
  const incident = correlateIncident({
    sessionId: session.sessionId,
    request,
    decision,
    runtime: session.runtime,
    previousGenerationId: session.currentGenerationId,
    revisedGenerationId,
    planDiff,
    deficiencyCarryForward,
  });
  return [
    ...session.incidents.filter((candidate) => candidate.id !== incident.id),
    incident,
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function emptyReservationReconciliation(): ReservationReconciliationResult {
  return {
    records: [],
    retainedReservationIds: [],
    releasedReservationIds: [],
    supersededReservationIds: [],
    newReservationIds: [],
    activeOccupancyResourceIds: [],
    duplicateOwnershipConflicts: [],
  };
}

function emptyPlanDiff(): PlanDiffResult {
  return {
    records: [],
    unchangedMissionIds: [],
    delayedMissionIds: [],
    cancelledMissionIds: [],
    replacementMissionIds: [],
    newlySatisfiedChitIds: [],
    newlyUnsatisfiedChitIds: [],
    scoreDelta: 0,
    rationale: "No revised planning generation has been produced yet.",
  };
}
