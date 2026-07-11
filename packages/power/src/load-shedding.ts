import { solveNormalizedPowerNetwork, mergeOptions } from "./dc-solver";
import { normalizeElectricalGraph } from "./normalize-network";
import { isProtectedTier } from "./tier-policy";
import type {
  NormalizedPowerLoad,
  PowerAnalysisResult,
  PowerNetworkInput,
  PowerSolverOptions,
  SheddingDecision,
  StableId,
} from "./types";

export function solvePowerNetworkWithShedding(
  input: PowerNetworkInput,
  options: Partial<PowerSolverOptions> = {},
): PowerAnalysisResult {
  const normalized = normalizeElectricalGraph(input);
  return shedLoadsDeterministically(normalized, options);
}

export function shedLoadsDeterministically(
  normalized: ReturnType<typeof normalizeElectricalGraph>,
  options: Partial<PowerSolverOptions> = {},
): PowerAnalysisResult {
  const mergedOptions = mergeOptions(options);
  const shedLoadIds = new Set<StableId>();
  const sheddingDecisions: SheddingDecision[] = [];
  let result = solveNormalizedPowerNetwork(normalized, mergedOptions, shedLoadIds, sheddingDecisions);

  while (requiresShedding(result)) {
    const candidate = nextSheddingCandidate(normalized.loads, shedLoadIds, mergedOptions);
    if (!candidate) {
      const protectedDecision = protectedConstraintDecision(result);
      if (protectedDecision) {
        sheddingDecisions.push(protectedDecision);
        result = solveNormalizedPowerNetwork(normalized, mergedOptions, shedLoadIds, sheddingDecisions);
      }
      break;
    }

    const decision = sheddingDecisionFor(candidate, result);
    shedLoadIds.add(candidate.id);
    sheddingDecisions.push(decision);
    result = solveNormalizedPowerNetwork(normalized, mergedOptions, shedLoadIds, sheddingDecisions);
  }

  return result;
}

function requiresShedding(result: PowerAnalysisResult): boolean {
  return (
    result.metrics.networkState === "source_limited" ||
    result.metrics.networkState === "overloaded" ||
    result.metrics.networkState === "brownout" ||
    result.metrics.networkState === "non_converged"
  );
}

function nextSheddingCandidate(
  loads: readonly NormalizedPowerLoad[],
  shedLoadIds: ReadonlySet<StableId>,
  options: PowerSolverOptions,
): NormalizedPowerLoad | undefined {
  return loads
    .filter((load) => load.enabled && load.requestedWatts > 0 && !shedLoadIds.has(load.id))
    .filter((load) => options.allowProtectedShedding || !isProtectedTier(load.consumerTier))
    .sort((left, right) => {
      const tierCompare = right.consumerTier - left.consumerTier;
      if (tierCompare !== 0) {
        return tierCompare;
      }
      const priorityCompare = right.sheddingPriority - left.sheddingPriority;
      if (priorityCompare !== 0) {
        return priorityCompare;
      }
      const classCompare = right.loadClass.localeCompare(left.loadClass);
      return classCompare === 0 ? left.id.localeCompare(right.id) : classCompare;
    })[0];
}

function sheddingDecisionFor(load: NormalizedPowerLoad, result: PowerAnalysisResult): SheddingDecision {
  const overloadedBranch = result.branches.find((branch) => branch.state === "overloaded");
  const sourceLimited = result.sources.find((source) => source.utilization > 1);
  const undervoltageLoad = result.loads.find((candidate) => candidate.state === "undervoltage");
  const reasonCode = sourceLimited
    ? "source_limit"
    : overloadedBranch
      ? "branch_overload"
      : result.metrics.networkState === "non_converged"
        ? "non_converged"
        : "undervoltage";
  const blockingIds = [
    sourceLimited?.id,
    overloadedBranch?.id,
    undervoltageLoad?.id,
  ].filter((id): id is StableId => Boolean(id));

  return {
    id: `power:shed:${load.id}`,
    loadId: load.id,
    consumerTier: load.consumerTier,
    sheddingPriority: load.sheddingPriority,
    reasonCode,
    reason: `Shed ${load.id} before protected tiers because the network state was ${result.metrics.networkState}.`,
    blockingIds,
  };
}

function protectedConstraintDecision(result: PowerAnalysisResult): SheddingDecision | undefined {
  const protectedLoad =
    result.loads.find((load) => isProtectedTier(load.consumerTier) && load.state !== "served") ??
    result.loads
      .filter((load) => isProtectedTier(load.consumerTier))
      .sort((left, right) => {
        const tierCompare = left.consumerTier - right.consumerTier;
        return tierCompare === 0 ? left.id.localeCompare(right.id) : tierCompare;
      })[0];
  if (!protectedLoad) {
    return undefined;
  }
  return {
    id: `power:protected:${protectedLoad.id}`,
    loadId: protectedLoad.id,
    consumerTier: protectedLoad.consumerTier,
    sheddingPriority: protectedLoad.sheddingPriority,
    reasonCode: "protected_constraint_violation",
    reason: `Protected load ${protectedLoad.id} could not be fully served; automatic shedding stopped at protected tier ${protectedLoad.consumerTier}.`,
    blockingIds: [protectedLoad.id, protectedLoad.nodeId],
  };
}
