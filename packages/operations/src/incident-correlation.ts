import type {
  IncidentCorrelationInput,
  OperationsIncident,
} from "./types";

export function correlateIncident(input: IncidentCorrelationInput): OperationsIncident {
  const event = input.runtime.eventHistory.find((candidate) => candidate.id === input.request.triggeredByEventId);
  const deficiencyIds = [
    ...(input.request.deficiency ? [input.request.deficiency.id] : []),
    ...(input.deficiencyCarryForward?.records.flatMap((record) => [
      record.previousDeficiencyId ?? "",
      record.revisedDeficiencyId ?? "",
    ]) ?? []),
  ].filter(Boolean).sort();

  return {
    id: `incident:${input.sessionId}:${input.request.id}`,
    requestId: input.request.id,
    triggeringEventIds: [input.request.triggeredByEventId, event?.causalEventId ?? ""].filter(Boolean).sort(),
    affectedMissionIds: [input.request.missionId ?? ""].filter(Boolean).sort(),
    affectedChitIds: input.request.chitIds.slice().sort(),
    affectedAssetIds: input.request.affectedAssetIds.slice().sort(),
    affectedResourceIds: [
      ...(event?.affectedResourceIds ?? []),
      ...input.request.releasedReservationIds,
      ...input.request.retainedReservationIds,
    ].sort(),
    previousGenerationId: input.previousGenerationId,
    revisedGenerationId: input.revisedGenerationId,
    deficiencyIds: [...new Set(deficiencyIds)],
    resolutionState: incidentState(input),
    summary: incidentSummary(input),
  };
}

function incidentState(input: IncidentCorrelationInput): OperationsIncident["resolutionState"] {
  if (input.decision.mode === "none") {
    return "no_action";
  }
  if (input.decision.mode === "deferred") {
    return "deferred";
  }
  if (input.revisedGenerationId) {
    return input.planDiff?.cancelledMissionIds.length === 0 && input.deficiencyCarryForward?.records.every((record) => record.status === "resolved")
      ? "resolved"
      : "replanned";
  }
  return "open";
}

function incidentSummary(input: IncidentCorrelationInput): string {
  const scope = input.request.missionId ? `mission ${input.request.missionId}` : `${input.request.chitIds.length} chits`;
  return `${input.decision.mode} replan decision for ${scope}: ${input.decision.rationale}`;
}
