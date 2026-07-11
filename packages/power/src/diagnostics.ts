import { normalizeElectricalGraph } from "./normalize-network";
import { shedLoadsDeterministically, solvePowerNetworkWithShedding } from "./load-shedding";
import type {
  NormalizedPowerNetwork,
  PowerAnalysisResult,
  PowerFinding,
  PowerFindingType,
  PowerNetworkInput,
  PowerRecommendation,
  PowerSolverOptions,
  RecommendationPreview,
  RecommendationScore,
  RecommendationType,
  StableId,
} from "./types";

type PathIndex = {
  resistanceByNodeId: Map<StableId, number>;
  pathBranchIdsByNodeId: Map<StableId, StableId[]>;
};

export function analyzePowerNetwork(
  input: PowerNetworkInput,
  options: Partial<PowerSolverOptions> = {},
): PowerAnalysisResult {
  const normalized = normalizeElectricalGraph(input);
  const solved = shedLoadsDeterministically(normalized, options);
  const findings = detectPowerFindings(solved);
  const recommendations = rankPowerRecommendations(solved, findings, options);
  return { ...solved, findings, recommendations };
}

export function detectPowerFindings(result: PowerAnalysisResult): PowerFinding[] {
  const pathIndex = buildPathIndex(result.normalized);
  const findings: PowerFinding[] = [];

  for (const load of result.loads.filter((load) => load.state === "disconnected")) {
    findings.push(finding({
      type: "islanded_load",
      key: load.id,
      severity: "error",
      label: "Electrical island has load but no source",
      explanation: `${load.id} is on an unsupplied electrical island.`,
      affectedIds: [load.id, load.nodeId],
      targetId: load.nodeId,
      targetKind: "node",
      metrics: { requestedWatts: load.requestedWatts },
    }));
  }

  for (const branch of result.branches.filter((branch) => branch.enabled && branch.utilization >= 0.85)) {
    const sourceAdjacent = result.sources.some(
      (source) => source.nodeId === branch.fromNodeId || source.nodeId === branch.toNodeId,
    );
    findings.push(finding({
      type: sourceAdjacent ? "source_bottleneck" : "shared_weak_path",
      key: branch.id,
      severity: branch.state === "overloaded" ? "error" : "warning",
      label: sourceAdjacent ? "Source-adjacent bottleneck" : "Shared weak feeder path",
      explanation: `${branch.id} is at ${formatPercent(branch.utilization)} of its current limit.`,
      affectedIds: [branch.id, branch.fromNodeId, branch.toNodeId],
      targetId: branch.id,
      targetKind: "branch",
      metrics: { utilization: branch.utilization, currentAmps: branch.absCurrentAmps },
      threshold: 0.85,
    }));
  }

  for (const load of result.loads.filter((load) => load.requestedWatts > 0)) {
    const pathResistance = pathIndex.resistanceByNodeId.get(load.nodeId) ?? 0;
    if (pathResistance >= 0.18 && (load.state !== "served" || load.voltage < load.minimumVoltage + 1.5)) {
      findings.push(finding({
        type: "long_radial_feed",
        key: load.id,
        severity: load.state === "served" ? "info" : "warning",
        label: "Long radial feed to load",
        explanation: `${load.id} is behind ${round(pathResistance)} ohms of feeder resistance from the nearest source.`,
        affectedIds: [load.id, load.nodeId, ...(pathIndex.pathBranchIdsByNodeId.get(load.nodeId) ?? [])],
        targetId: load.id,
        targetKind: "load",
        metrics: { pathResistanceOhms: pathResistance, voltage: load.voltage, requestedWatts: load.requestedWatts },
        threshold: 0.18,
      }));
    }
  }

  const farLoads = result.loads.filter((load) => (pathIndex.resistanceByNodeId.get(load.nodeId) ?? 0) >= 0.18);
  const farLoadWatts = farLoads.reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0);
  if (farLoads.length >= 2 || farLoadWatts >= 18) {
    const targetLoad = [...farLoads].sort((left, right) => {
      const wattsCompare = right.requestedWatts - left.requestedWatts;
      return Math.abs(wattsCompare) > 1e-9 ? wattsCompare : left.id.localeCompare(right.id);
    })[0];
    findings.push(finding({
      type: "far_end_load_cluster",
      key: targetLoad?.id ?? "cluster",
      severity: result.metrics.networkState === "nominal" ? "info" : "warning",
      label: "Concentrated far-end loads",
      explanation: `${round(farLoadWatts)} W of load is concentrated behind high feeder resistance.`,
      affectedIds: farLoads.flatMap((load) => [load.id, load.nodeId]).sort(),
      targetId: targetLoad?.id,
      targetKind: targetLoad ? "load" : undefined,
      metrics: { requestedWatts: farLoadWatts, loadCount: farLoads.length },
      threshold: 18,
    }));
  }

  if (result.metrics.worstVoltageDropPercent >= 8) {
    const lowestNode = [...result.nodes].sort((left, right) => {
      const voltageCompare = left.voltage - right.voltage;
      return Math.abs(voltageCompare) > 1e-9 ? voltageCompare : left.id.localeCompare(right.id);
    })[0];
    findings.push(finding({
      type: "poor_source_placement",
      key: lowestNode?.id ?? "network",
      severity: "warning",
      label: "Source placement produces excessive voltage drop",
      explanation: `Worst-case drop is ${round(result.metrics.worstVoltageDropPercent)}%.`,
      affectedIds: lowestNode ? [lowestNode.id] : [],
      targetId: lowestNode?.id,
      targetKind: "node",
      metrics: { worstVoltageDropPercent: result.metrics.worstVoltageDropPercent },
      threshold: 8,
    }));
  }

  if (result.metrics.networkState !== "nominal" && result.metrics.totalRequestedLoadWatts > 90) {
    findings.push(finding({
      type: "surge_failure",
      key: "selected-preset",
      severity: "warning",
      label: "Layout fails under surge-style loading",
      explanation: "The selected operating case exceeds at least one voltage, source, or branch constraint.",
      affectedIds: [
        ...result.loads.filter((load) => load.state !== "served").map((load) => load.id),
        ...result.branches.filter((branch) => branch.state === "overloaded").map((branch) => branch.id),
      ].sort(),
      targetId: result.metrics.worstBranchId,
      targetKind: result.metrics.worstBranchId ? "branch" : undefined,
      metrics: { requestedWatts: result.metrics.totalRequestedLoadWatts, unservedWatts: result.metrics.unservedWatts },
    }));
  }

  return uniqueById(findings).sort((left, right) => left.id.localeCompare(right.id));
}

export function rankPowerRecommendations(
  result: PowerAnalysisResult,
  findings: readonly PowerFinding[] = result.findings,
  options: Partial<PowerSolverOptions> = {},
): PowerRecommendation[] {
  const recommendations = findings.flatMap((finding) => recommendationsForFinding(result, finding, options));
  return uniqueById(recommendations)
    .filter((recommendation) => recommendation.score.total > 0)
    .sort((left, right) => {
      const scoreCompare = right.score.total - left.score.total;
      if (Math.abs(scoreCompare) > 1e-9) {
        return scoreCompare;
      }
      const confidenceCompare = confidenceRank(right.confidence) - confidenceRank(left.confidence);
      if (confidenceCompare !== 0) {
        return confidenceCompare;
      }
      const costCompare = costRank(left.costClass) - costRank(right.costClass);
      return costCompare === 0 ? left.id.localeCompare(right.id) : costCompare;
    });
}

function recommendationsForFinding(
  result: PowerAnalysisResult,
  finding: PowerFinding,
  options: Partial<PowerSolverOptions>,
): PowerRecommendation[] {
  switch (finding.type) {
    case "islanded_load":
    case "long_radial_feed":
    case "far_end_load_cluster":
    case "poor_source_placement":
    case "surge_failure":
      return [simulateAddSource(result, finding, options), simulateMoveLoad(result, finding, options)].filter(
        (recommendation): recommendation is PowerRecommendation => Boolean(recommendation),
      );
    case "source_bottleneck":
    case "near_source_capacity":
    case "shared_weak_path":
      return [simulateReinforceBranch(result, finding, options)].filter(
        (recommendation): recommendation is PowerRecommendation => Boolean(recommendation),
      );
    case "ineffective_loop":
    case "safety_redundancy":
      return [heuristicRecommendation(result, finding)];
  }
}

function simulateAddSource(
  result: PowerAnalysisResult,
  finding: PowerFinding,
  options: Partial<PowerSolverOptions>,
): PowerRecommendation | undefined {
  const targetNodeId = targetNodeForFinding(result, finding);
  if (!targetNodeId) {
    return undefined;
  }
  const sourceVoltage = result.sources[0]?.nominalVoltage ?? 24;
  const candidate = toInput(result.normalized);
  candidate.sources = [
    ...candidate.sources,
    {
      id: `recommendation-source:${targetNodeId}`,
      nodeId: targetNodeId,
      nominalVoltage: sourceVoltage,
      maximumWatts: 100,
    },
  ];
  return recommendationFromSimulation({
    result,
    finding,
    type: "add_source",
    candidate,
    options,
    targetId: targetNodeId,
    targetKind: "node",
    proposedChange: `Add a 24 V / 100 W injection source at ${targetNodeId}.`,
    costClass: "medium",
    tradeoffs: ["Adds another protected injection point and source capacity.", "Requires physical feeder/source hardware."],
  });
}

function simulateReinforceBranch(
  result: PowerAnalysisResult,
  finding: PowerFinding,
  options: Partial<PowerSolverOptions>,
): PowerRecommendation | undefined {
  const branchId = finding.targetKind === "branch" ? finding.targetId : result.metrics.worstBranchId;
  if (!branchId) {
    return undefined;
  }
  const candidate = toInput(result.normalized);
  candidate.branches = candidate.branches.map((branch) =>
    branch.id === branchId
      ? {
          ...branch,
          resistanceOhms: branch.resistanceOhms / 2,
          currentLimitAmps: branch.currentLimitAmps * 2,
        }
      : branch,
  );
  return recommendationFromSimulation({
    result,
    finding,
    type: "reinforce_branch",
    candidate,
    options,
    targetId: branchId,
    targetKind: "branch",
    proposedChange: `Replace ${branchId} with a lower-resistance, higher-current feeder.`,
    costClass: "low",
    tradeoffs: ["Improves one bottleneck but does not add source wattage.", "May move the next bottleneck farther from the source."],
  });
}

function simulateMoveLoad(
  result: PowerAnalysisResult,
  finding: PowerFinding,
  options: Partial<PowerSolverOptions>,
): PowerRecommendation | undefined {
  const loadId = finding.targetKind === "load" ? finding.targetId : finding.affectedIds.find((id) => result.loads.some((load) => load.id === id));
  const sourceNodeId = result.sources[0]?.nodeId;
  if (!loadId || !sourceNodeId) {
    return undefined;
  }
  const candidate = toInput(result.normalized);
  candidate.loads = candidate.loads.map((load) => load.id === loadId ? { ...load, nodeId: sourceNodeId } : load);
  return recommendationFromSimulation({
    result,
    finding,
    type: "move_load",
    candidate,
    options,
    targetId: loadId,
    targetKind: "load",
    proposedChange: `Move ${loadId} closer to injection node ${sourceNodeId}.`,
    costClass: "high",
    tradeoffs: ["Reduces feeder drop for this load.", "Requires physical relocation and may reduce service-zone fit."],
  });
}

function heuristicRecommendation(result: PowerAnalysisResult, finding: PowerFinding): PowerRecommendation {
  const score = buildScore(result, result, "add_feeder", "medium");
  score.total = 1;
  return {
    id: `power-recommendation:add-feeder:${finding.id}`,
    type: "add_feeder",
    affectedIds: finding.affectedIds,
    targetId: finding.targetId,
    targetKind: finding.targetKind,
    observedDeficiency: finding.explanation,
    proposedChange: "Add a redundant feeder across the weak region.",
    score,
    confidence: "low",
    applicability: "heuristic",
    costClass: "medium",
    tradeoffs: ["Requires another physical path.", "This first-pass advisory does not place a concrete tile."],
    explanation: "A redundant feeder is the likely physical remedy, but no direct cloned-network simulation was possible.",
  };
}

function recommendationFromSimulation(input: {
  result: PowerAnalysisResult;
  finding: PowerFinding;
  type: RecommendationType;
  candidate: PowerNetworkInput;
  options: Partial<PowerSolverOptions>;
  targetId?: StableId;
  targetKind?: PowerRecommendation["targetKind"];
  proposedChange: string;
  costClass: PowerRecommendation["costClass"];
  tradeoffs: string[];
}): PowerRecommendation | undefined {
  const after = solvePowerNetworkWithShedding(input.candidate, input.options);
  const score = buildScore(input.result, after, input.type, input.costClass);
  if (score.total <= 0) {
    return undefined;
  }

  return {
    id: `power-recommendation:${input.type}:${input.targetId ?? input.finding.id}`,
    type: input.type,
    affectedIds: uniqueStrings([input.targetId, ...input.finding.affectedIds].filter((id): id is string => Boolean(id))),
    targetId: input.targetId,
    targetKind: input.targetKind,
    observedDeficiency: input.finding.explanation,
    proposedChange: input.proposedChange,
    preview: previewFor(input.result, after),
    score,
    confidence: input.type === "add_source" || input.type === "reinforce_branch" ? "high" : "medium",
    applicability: "direct_simulation",
    costClass: input.costClass,
    tradeoffs: input.tradeoffs,
    explanation: `${input.proposedChange} Predicted score improvement is ${round(score.total)}.`,
  };
}

function buildScore(
  before: PowerAnalysisResult,
  after: PowerAnalysisResult,
  type: RecommendationType,
  costClass: PowerRecommendation["costClass"],
): RecommendationScore {
  const restoredCriticalTier = criticalTierPenalty(before) - criticalTierPenalty(after);
  const brownoutElimination = before.metrics.networkState === "brownout" && after.metrics.networkState !== "brownout" ? 18 : 0;
  const overloadElimination = before.metrics.networkState === "overloaded" && after.metrics.networkState !== "overloaded" ? 18 : 0;
  const minimumVoltageImprovement = Math.max(0, after.metrics.minimumNodeVoltage - before.metrics.minimumNodeVoltage);
  const branchHeadroomImprovement = Math.max(0, before.metrics.worstBranchUtilization - after.metrics.worstBranchUtilization) * 10;
  const lossReduction = Math.max(0, before.metrics.totalConductorLossWatts - after.metrics.totalConductorLossWatts) * 2;
  const servedLoadImprovement = Math.max(0, after.metrics.totalDeliveredLoadWatts - before.metrics.totalDeliveredLoadWatts);
  const changeCostPenalty = costRank(costClass) * 2 + (type === "move_load" ? 4 : 0);
  const total =
    restoredCriticalTier +
    brownoutElimination +
    overloadElimination +
    minimumVoltageImprovement +
    branchHeadroomImprovement +
    lossReduction +
    servedLoadImprovement -
    changeCostPenalty;

  return {
    restoredCriticalTier: round(restoredCriticalTier),
    brownoutElimination: round(brownoutElimination),
    overloadElimination: round(overloadElimination),
    minimumVoltageImprovement: round(minimumVoltageImprovement),
    branchHeadroomImprovement: round(branchHeadroomImprovement),
    lossReduction: round(lossReduction),
    servedLoadImprovement: round(servedLoadImprovement),
    changeCostPenalty: round(changeCostPenalty),
    total: round(total),
  };
}

function criticalTierPenalty(result: PowerAnalysisResult): number {
  return result.tierSummaries
    .filter((tier) => tier.tier <= 2)
    .reduce((sum, tier) => sum + tier.undervoltageWatts * (7 - tier.tier) + tier.shedWatts * (8 - tier.tier), 0);
}

function previewFor(before: PowerAnalysisResult, after: PowerAnalysisResult): RecommendationPreview {
  return {
    before: metricPreview(before),
    after: metricPreview(after),
  };
}

function metricPreview(result: PowerAnalysisResult): RecommendationPreview["before"] {
  return {
    networkState: result.metrics.networkState,
    minimumNodeVoltage: result.metrics.minimumNodeVoltage,
    worstBranchUtilization: result.metrics.worstBranchUtilization,
    totalDeliveredLoadWatts: result.metrics.totalDeliveredLoadWatts,
    totalConductorLossWatts: result.metrics.totalConductorLossWatts,
    unservedWatts: result.metrics.unservedWatts,
  };
}

function targetNodeForFinding(result: PowerAnalysisResult, finding: PowerFinding): StableId | undefined {
  if (finding.targetKind === "node") {
    return finding.targetId;
  }
  if (finding.targetKind === "load" && finding.targetId) {
    return result.loads.find((load) => load.id === finding.targetId)?.nodeId;
  }
  const affectedLoadId = finding.affectedIds.find((id) => result.loads.some((load) => load.id === id));
  if (affectedLoadId) {
    return result.loads.find((load) => load.id === affectedLoadId)?.nodeId;
  }
  return result.nodes.find((node) => !node.hasSource)?.id ?? result.nodes[0]?.id;
}

function buildPathIndex(network: NormalizedPowerNetwork): PathIndex {
  const sourceNodeIds = network.sources.map((source) => source.nodeId).sort();
  const resistanceByNodeId = new Map<StableId, number>();
  const pathBranchIdsByNodeId = new Map<StableId, StableId[]>();
  const pending = network.nodes.map((node) => node.id);
  for (const node of network.nodes) {
    resistanceByNodeId.set(node.id, sourceNodeIds.includes(node.id) ? 0 : Number.POSITIVE_INFINITY);
    pathBranchIdsByNodeId.set(node.id, []);
  }

  while (pending.length > 0) {
    pending.sort((left, right) => {
      const distanceCompare = (resistanceByNodeId.get(left) ?? Infinity) - (resistanceByNodeId.get(right) ?? Infinity);
      return Math.abs(distanceCompare) > 1e-9 ? distanceCompare : left.localeCompare(right);
    });
    const current = pending.shift() as StableId;
    const currentDistance = resistanceByNodeId.get(current) ?? Infinity;
    if (!Number.isFinite(currentDistance)) {
      break;
    }
    for (const branch of network.branches.filter((branch) => branch.enabled && (branch.fromNodeId === current || branch.toNodeId === current))) {
      const next = branch.fromNodeId === current ? branch.toNodeId : branch.fromNodeId;
      const nextDistance = currentDistance + branch.resistanceOhms;
      if (nextDistance < (resistanceByNodeId.get(next) ?? Infinity)) {
        resistanceByNodeId.set(next, nextDistance);
        pathBranchIdsByNodeId.set(next, [...(pathBranchIdsByNodeId.get(current) ?? []), branch.id]);
      }
    }
  }

  return { resistanceByNodeId, pathBranchIdsByNodeId };
}

function toInput(network: NormalizedPowerNetwork): PowerNetworkInput {
  return {
    nodes: network.nodes.map(({ id, tileId, localNodeId }) => ({ id, tileId, localNodeId })),
    branches: network.branches.map((branch) => ({ ...branch })),
    sources: network.sources.map((source) => ({ ...source })),
    loads: network.loads.map((load) => ({ ...load })),
  };
}

function finding(input: Omit<PowerFinding, "id"> & { key: StableId }): PowerFinding {
  return {
    id: `power-finding:${input.type}:${input.key}`,
    type: input.type as PowerFindingType,
    severity: input.severity,
    label: input.label,
    explanation: input.explanation,
    affectedIds: uniqueStrings(input.affectedIds),
    targetId: input.targetId,
    targetKind: input.targetKind,
    metrics: input.metrics,
    threshold: input.threshold,
  };
}

function uniqueById<T extends { id: StableId }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function uniqueStrings(values: readonly StableId[]): StableId[] {
  return [...new Set(values)].sort();
}

function confidenceRank(confidence: PowerRecommendation["confidence"]): number {
  return { low: 0, medium: 1, high: 2 }[confidence];
}

function costRank(costClass: PowerRecommendation["costClass"]): number {
  return { low: 1, medium: 2, high: 3 }[costClass];
}

function formatPercent(value: number): string {
  return `${round(value * 100)}%`;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
