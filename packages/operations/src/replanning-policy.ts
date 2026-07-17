import type {
  OperationsReplanningRequest,
  PolicyTriggerInput,
  ReplanningPolicyDecision,
  ReplanningTriggerKind,
} from "./types";

const severityRank = {
  info: 0,
  warning: 1,
  error: 2,
} as const;

export function evaluateReplanningPolicy(input: PolicyTriggerInput): ReplanningPolicyDecision {
  const trigger = normalizeTrigger(input);
  const base = {
    id: `policy:${input.requestId}`,
    requestId: input.requestId,
    trigger,
    scopeMissionIds: input.missionId ? [input.missionId] : [],
    scopeChitIds: [...(input.chitIds ?? [])].sort(),
    scopeAssetIds: [...(input.affectedAssetIds ?? [])].sort(),
  };

  if (trigger === "fault_cleared" || trigger === "completed_mission") {
    return {
      ...base,
      mode: "none",
      priority: "low",
      rationale: "The trigger does not invalidate open work or active reservations.",
    };
  }

  if (trigger === "released_high_priority_asset") {
    return {
      ...base,
      mode: "deferred",
      priority: "normal",
      deferUntil: "mission_boundary",
      rationale: "A high-priority asset became available; defer replanning until the current mission boundary to avoid needless churn.",
    };
  }

  if (trigger === "operator_request" || trigger === "material_queue_growth" || trigger === "missed_deadline") {
    return {
      ...base,
      mode: "full",
      priority: trigger === "operator_request" ? "normal" : "high",
      rationale: fullReplanRationale(trigger),
    };
  }

  if (trigger === "mission_failure" && !input.missionId) {
    return {
      ...base,
      mode: "full",
      priority: "critical",
      rationale: "A mission failure without a bounded mission scope can invalidate the full open queue.",
    };
  }

  return {
    ...base,
    mode: "partial",
    priority: partialPriority(input),
    rationale: partialReplanRationale(trigger, input.reason),
  };
}

export function policyDecisionForRequest(request: OperationsReplanningRequest): ReplanningPolicyDecision {
  return evaluateReplanningPolicy({
    requestId: request.id,
    trigger: request.trigger,
    missionId: request.missionId,
    chitIds: request.chitIds,
    affectedAssetIds: request.affectedAssetIds,
    affectedResourceIds: [
      ...request.releasedReservationIds,
      ...request.retainedReservationIds,
    ],
    reason: request.reason,
    deficiency: request.deficiency,
    currentTime: request.currentTime,
  });
}

export function triggerFromSimulationRequest(request: Pick<OperationsReplanningRequest, "reason" | "deficiency">): ReplanningTriggerKind {
  const reason = request.reason.toLowerCase();
  if (request.deficiency?.kind === "reservation_conflict" || reason.includes("reservation")) {
    return "reservation_conflict";
  }
  if (request.deficiency?.kind === "power_blocked" || request.deficiency?.kind === "power_delayed" || reason.includes("power")) {
    return "power_launch_failure";
  }
  if (request.deficiency?.kind === "state_of_charge" || reason.includes("battery") || reason.includes("reserve")) {
    return "battery_power_failure";
  }
  if (request.deficiency?.kind === "service_zone_full" || reason.includes("service") || reason.includes("charger")) {
    return "service_outage";
  }
  if (request.deficiency?.kind === "route_unreachable" || reason.includes("route") || reason.includes("guideway") || reason.includes("blocked")) {
    return "route_blockage";
  }
  if (request.deficiency?.kind === "asset_unavailable" || reason.includes("asset") || reason.includes("vehicle")) {
    return "asset_failure";
  }
  if (reason.includes("deadline") || reason.includes("late")) {
    return "missed_deadline";
  }
  if (reason.includes("failed") || reason.includes("failure")) {
    return "mission_failure";
  }
  return "mission_failure";
}

function normalizeTrigger(input: PolicyTriggerInput): ReplanningTriggerKind {
  if (input.trigger === "material_queue_growth" && input.queueGrowthRatio !== undefined && input.queueGrowthRatio < 0.25) {
    return "fault_cleared";
  }
  return input.trigger;
}

function partialPriority(input: PolicyTriggerInput): ReplanningPolicyDecision["priority"] {
  if (input.deficiency?.severity === "error" || input.trigger === "mission_failure") {
    return "critical";
  }
  if (input.deficiency && severityRank[input.deficiency.severity] >= severityRank.warning) {
    return "high";
  }
  if (input.trigger === "route_blockage" || input.trigger === "battery_power_failure") {
    return "high";
  }
  return "normal";
}

function fullReplanRationale(trigger: ReplanningTriggerKind): string {
  switch (trigger) {
    case "operator_request":
      return "The operator requested a deterministic full replan of the open queue.";
    case "material_queue_growth":
      return "Queue growth can alter global priority and grouping, so the full queue is replanned.";
    case "missed_deadline":
      return "A missed hard deadline invalidates ranking assumptions across the open queue.";
    default:
      return "The trigger invalidates the current planning generation globally.";
  }
}

function partialReplanRationale(trigger: ReplanningTriggerKind, reason = "runtime divergence"): string {
  return `${trigger.replaceAll("_", " ")} affects a bounded mission or resource scope: ${reason}`;
}
