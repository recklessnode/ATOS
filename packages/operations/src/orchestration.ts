import { planDispatch } from "@atos/dispatch";
import {
  createSimulationFixture,
  initializeSimulation,
  stepSimulationToNextEvent,
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
  const revisedDispatch = planDispatch(projection.dispatchInput);
  const generation = generationFor(
    session.sessionId,
    previousGeneration.generationNumber + 1,
    session.runtime.clock.currentTime,
    revisedDispatch,
    decision,
    projection,
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

  return {
    ...session,
    currentGenerationId: finalizedGeneration.id,
    generations,
    pendingRequests: session.pendingRequests.filter((candidate) => candidate.id !== request.id),
    policyDecisions: upsertPolicyDecision(session.policyDecisions, decision),
    reservationReconciliation,
    planDiff,
    deficiencyCarryForward,
    incidents: upsertIncident(session, request, decision, finalizedGeneration.id, planDiff, deficiencyCarryForward),
    metrics: calculateOperationsMetrics(session.runtime, generations, session.policyDecisions.length + 1),
  };
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
