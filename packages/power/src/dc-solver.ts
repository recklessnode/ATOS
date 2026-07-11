import { buildConductanceMatrix, fixedVoltagesByNodeId, loadCurrentAtVoltage, solveLinearSystem } from "./linear-solver";
import { normalizeElectricalGraph } from "./normalize-network";
import { isProtectedTier, POWER_TIER_LABELS } from "./tier-policy";
import type {
  BranchPowerResult,
  LoadPowerResult,
  NetworkState,
  NodePowerResult,
  NormalizedPowerLoad,
  NormalizedPowerNetwork,
  PowerAnalysisResult,
  PowerDiagnostic,
  PowerMetrics,
  PowerNetworkInput,
  PowerSolverOptions,
  SheddingDecision,
  SourcePowerResult,
  StableId,
  TierPowerSummary,
} from "./types";

export const DEFAULT_POWER_SOLVER_OPTIONS: PowerSolverOptions = {
  maxIterations: 80,
  voltageTolerance: 1e-6,
  dampingFactor: 0.62,
  regularizationVoltageFloor: 1,
  branchNearLimitThreshold: 0.85,
  powerBalanceToleranceWatts: 1e-4,
  allowProtectedShedding: false,
};

export function solvePowerNetwork(
  input: PowerNetworkInput | NormalizedPowerNetwork,
  options: Partial<PowerSolverOptions> = {},
): PowerAnalysisResult {
  const normalized = isNormalizedNetwork(input) ? input : normalizeElectricalGraph(input);
  return solveNormalizedPowerNetwork(normalized, mergeOptions(options), new Set(), []);
}

export function solveNormalizedPowerNetwork(
  normalized: NormalizedPowerNetwork,
  options: PowerSolverOptions = DEFAULT_POWER_SOLVER_OPTIONS,
  shedLoadIds: ReadonlySet<StableId> = new Set(),
  sheddingDecisions: readonly SheddingDecision[] = [],
): PowerAnalysisResult {
  const fatalValidationIssues = normalized.validationIssues.filter((issue) => issue.severity === "error");
  const fixedVoltages = fixedVoltagesByNodeId(normalized);
  const voltageByNodeId = initialVoltages(normalized, fixedVoltages);
  let converged = fatalValidationIssues.length === 0;
  let maxVoltageDelta = 0;
  let iterationCount = 0;

  if (fatalValidationIssues.length === 0) {
    for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
      iterationCount = iteration;
      const loadCurrentsByNodeId = constantPowerCurrentsByNodeId(
        normalized,
        voltageByNodeId,
        options,
        shedLoadIds,
      );
      const nextVoltages = solveVoltages(normalized, fixedVoltages, loadCurrentsByNodeId, voltageByNodeId);
      maxVoltageDelta = 0;

      for (const node of normalized.nodes) {
        const nextVoltage = fixedVoltages.get(node.id) ?? nextVoltages.get(node.id) ?? 0;
        const previousVoltage = voltageByNodeId.get(node.id) ?? 0;
        const dampedVoltage = fixedVoltages.has(node.id)
          ? nextVoltage
          : options.dampingFactor * nextVoltage + (1 - options.dampingFactor) * previousVoltage;
        voltageByNodeId.set(node.id, node.hasSource ? finiteOr(dampedVoltage, previousVoltage) : 0);
        maxVoltageDelta = Math.max(maxVoltageDelta, Math.abs((voltageByNodeId.get(node.id) ?? 0) - previousVoltage));
      }

      if (maxVoltageDelta <= options.voltageTolerance) {
        converged = true;
        break;
      }
      converged = false;
    }
  }

  const loadResults = buildLoadResults(normalized, voltageByNodeId, options, shedLoadIds, converged, sheddingDecisions);
  const branchResults = buildBranchResults(normalized, voltageByNodeId, options);
  const sourceResults = buildSourceResults(normalized, voltageByNodeId, branchResults, loadResults);
  const nodeResults = buildNodeResults(normalized, voltageByNodeId);
  const tierSummaries = buildTierSummaries(loadResults);
  const metrics = buildMetrics({
    normalized,
    converged,
    iterationCount,
    maxVoltageDelta,
    nodes: nodeResults,
    branches: branchResults,
    loads: loadResults,
    sources: sourceResults,
    options,
    shedLoadIds,
  });
  const diagnostics = buildPowerDiagnostics(normalized, metrics, branchResults, loadResults, sourceResults, options);
  const protectedConstraintTier = protectedConstraintTierFromDecisions(sheddingDecisions);

  return {
    normalized,
    nodes: nodeResults,
    branches: branchResults,
    loads: loadResults,
    sources: sourceResults,
    diagnostics,
    findings: [],
    recommendations: [],
    tierSummaries,
    sheddingDecisions: [...sheddingDecisions],
    metrics,
    safetyPreserved: tierPreserved(tierSummaries, 0, protectedConstraintTier),
    controlPreserved: tierPreserved(tierSummaries, 1, protectedConstraintTier),
    mobilityPreserved: tierPreserved(tierSummaries, 2, protectedConstraintTier),
    highestProtectedTierNotFullyServed: highestProtectedTierNotFullyServed(tierSummaries, protectedConstraintTier),
  };
}

export function mergeOptions(options: Partial<PowerSolverOptions> = {}): PowerSolverOptions {
  return { ...DEFAULT_POWER_SOLVER_OPTIONS, ...options };
}

function solveVoltages(
  network: NormalizedPowerNetwork,
  fixedVoltages: ReadonlyMap<StableId, number>,
  loadCurrentsByNodeId: ReadonlyMap<StableId, number>,
  previousVoltages: ReadonlyMap<StableId, number>,
): Map<StableId, number> {
  const voltages = new Map<StableId, number>();
  const system = buildConductanceMatrix(network, loadCurrentsByNodeId);
  if (system.unknownNodeIds.length === 0) {
    return voltages;
  }

  try {
    const solved = solveLinearSystem(system.matrix, system.rhs);
    system.unknownNodeIds.forEach((nodeId, index) => {
      voltages.set(nodeId, finiteOr(solved[index] ?? 0, previousVoltages.get(nodeId) ?? 0));
    });
  } catch {
    for (const nodeId of system.unknownNodeIds) {
      voltages.set(nodeId, previousVoltages.get(nodeId) ?? fixedVoltages.get(nodeId) ?? 0);
    }
  }

  return voltages;
}

function constantPowerCurrentsByNodeId(
  network: NormalizedPowerNetwork,
  voltages: ReadonlyMap<StableId, number>,
  options: PowerSolverOptions,
  shedLoadIds: ReadonlySet<StableId>,
): Map<StableId, number> {
  const currents = new Map<StableId, number>();
  for (const load of network.loads) {
    if (!load.enabled || shedLoadIds.has(load.id) || load.model !== "constant_power") {
      continue;
    }
    const node = network.nodes.find((candidate) => candidate.id === load.nodeId);
    if (!node?.hasSource) {
      continue;
    }
    const voltage = voltages.get(load.nodeId) ?? 0;
    currents.set(
      load.nodeId,
      (currents.get(load.nodeId) ?? 0) + loadCurrentAtVoltage(load, voltage, options.regularizationVoltageFloor),
    );
  }
  return currents;
}

function initialVoltages(
  network: NormalizedPowerNetwork,
  fixedVoltages: ReadonlyMap<StableId, number>,
): Map<StableId, number> {
  const sourceVoltageByComponent = new Map<StableId, number>();
  for (const source of network.sources) {
    const componentId = network.nodes.find((node) => node.id === source.nodeId)?.componentId;
    if (componentId) {
      sourceVoltageByComponent.set(componentId, source.nominalVoltage);
    }
  }

  return new Map(
    network.nodes.map((node) => [
      node.id,
      fixedVoltages.get(node.id) ?? (node.hasSource ? sourceVoltageByComponent.get(node.componentId) ?? 0 : 0),
    ]),
  );
}

function buildNodeResults(
  network: NormalizedPowerNetwork,
  voltageByNodeId: ReadonlyMap<StableId, number>,
): NodePowerResult[] {
  return network.nodes.map((node) => ({
    id: node.id,
    voltage: round(voltageByNodeId.get(node.id) ?? 0),
    componentId: node.componentId,
    hasSource: node.hasSource,
    connectedBranchIds: network.branches
      .filter((branch) => branch.fromNodeId === node.id || branch.toNodeId === node.id)
      .map((branch) => branch.id)
      .sort(),
    attachedSourceIds: network.sources.filter((source) => source.nodeId === node.id).map((source) => source.id).sort(),
    attachedLoadIds: network.loads.filter((load) => load.nodeId === node.id).map((load) => load.id).sort(),
  }));
}

function buildBranchResults(
  network: NormalizedPowerNetwork,
  voltageByNodeId: ReadonlyMap<StableId, number>,
  options: PowerSolverOptions,
): BranchPowerResult[] {
  return network.branches.map((branch) => {
    const fromVoltage = voltageByNodeId.get(branch.fromNodeId) ?? 0;
    const toVoltage = voltageByNodeId.get(branch.toNodeId) ?? 0;
    const currentAmps = branch.enabled ? (fromVoltage - toVoltage) / branch.resistanceOhms : 0;
    const absCurrentAmps = Math.abs(currentAmps);
    const utilization = absCurrentAmps / branch.currentLimitAmps;
    return {
      id: branch.id,
      fromNodeId: branch.fromNodeId,
      toNodeId: branch.toNodeId,
      currentAmps: round(currentAmps),
      absCurrentAmps: round(absCurrentAmps),
      voltageDrop: round(fromVoltage - toVoltage),
      powerLossWatts: round(absCurrentAmps * absCurrentAmps * branch.resistanceOhms),
      currentLimitAmps: branch.currentLimitAmps,
      utilization: round(utilization),
      state: branch.enabled ? branchState(utilization, options) : "disabled",
      resistanceOhms: branch.resistanceOhms,
      enabled: branch.enabled,
    };
  });
}

function buildLoadResults(
  network: NormalizedPowerNetwork,
  voltageByNodeId: ReadonlyMap<StableId, number>,
  options: PowerSolverOptions,
  shedLoadIds: ReadonlySet<StableId>,
  converged: boolean,
  sheddingDecisions: readonly SheddingDecision[],
): LoadPowerResult[] {
  const sheddingReasonByLoadId = new Map(sheddingDecisions.map((decision) => [decision.loadId, decision.reason]));
  return network.loads.map((load) => {
    const node = network.nodes.find((candidate) => candidate.id === load.nodeId);
    const voltage = voltageByNodeId.get(load.nodeId) ?? 0;
    const shed = shedLoadIds.has(load.id);
    const current = load.enabled && !shed && node?.hasSource
      ? loadCurrentAtVoltage(load, voltage, options.regularizationVoltageFloor)
      : 0;
    const delivered = load.enabled && !shed && node?.hasSource ? Math.max(0, voltage * current) : 0;
    return {
      id: load.id,
      nodeId: load.nodeId,
      requestedWatts: load.requestedWatts,
      deliveredWatts: round(Math.min(Math.max(0, load.requestedWatts), delivered)),
      currentAmps: round(current),
      voltage: round(voltage),
      minimumVoltage: load.minimumVoltage,
      loadClass: load.loadClass,
      consumerTier: load.consumerTier,
      sheddingPriority: load.sheddingPriority,
      model: load.model,
      state: loadState({ load, nodeHasSource: Boolean(node?.hasSource), voltage, shed, converged }),
      sheddingReason: sheddingReasonByLoadId.get(load.id),
    };
  });
}

function buildSourceResults(
  network: NormalizedPowerNetwork,
  voltageByNodeId: ReadonlyMap<StableId, number>,
  branches: readonly BranchPowerResult[],
  loads: readonly LoadPowerResult[],
): SourcePowerResult[] {
  const sourcesByNodeId = groupBy(network.sources, (source) => source.nodeId);

  return network.sources.map((source) => {
    const sourceNodeCurrent = sourceCurrentAtNode(source.nodeId, branches, loads);
    const nodeSources = sourcesByNodeId.get(source.nodeId) ?? [source];
    const totalCapacity = nodeSources.reduce((sum, nodeSource) => sum + nodeSource.maximumWatts, 0);
    const share = totalCapacity > 0 ? source.maximumWatts / totalCapacity : 1 / nodeSources.length;
    const currentAmps = sourceNodeCurrent * share;
    const deliveredWatts = currentAmps * (voltageByNodeId.get(source.nodeId) ?? source.nominalVoltage);
    const sourceCurrentCapacity = source.maximumWatts / source.nominalVoltage;

    return {
      id: source.id,
      nodeId: source.nodeId,
      nominalVoltage: source.nominalVoltage,
      maximumWatts: source.maximumWatts,
      currentAmps: round(currentAmps),
      deliveredWatts: round(deliveredWatts),
      utilization: round(deliveredWatts / source.maximumWatts),
      wattageHeadroom: round(source.maximumWatts - deliveredWatts),
      currentHeadroom: round(sourceCurrentCapacity - currentAmps),
    };
  });
}

function buildTierSummaries(loads: readonly LoadPowerResult[]): TierPowerSummary[] {
  return ([0, 1, 2, 3, 4, 5, 6] as const).map((tier) => {
    const tierLoads = loads.filter((load) => load.consumerTier === tier);
    const shedLoads = tierLoads.filter((load) => load.state === "shed");
    const undervoltageLoads = tierLoads.filter((load) => load.state === "undervoltage" || load.state === "disconnected" || load.state === "infeasible");
    return {
      tier,
      label: POWER_TIER_LABELS[tier],
      requestedWatts: round(tierLoads.reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0)),
      deliveredWatts: round(tierLoads.reduce((sum, load) => sum + Math.max(0, load.deliveredWatts), 0)),
      shedWatts: round(shedLoads.reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0)),
      undervoltageWatts: round(undervoltageLoads.reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0)),
      loadCount: tierLoads.length,
      servedCount: tierLoads.filter((load) => load.state === "served").length,
      shedCount: shedLoads.length,
      undervoltageCount: undervoltageLoads.length,
    };
  });
}

function buildMetrics(input: {
  normalized: NormalizedPowerNetwork;
  converged: boolean;
  iterationCount: number;
  maxVoltageDelta: number;
  nodes: readonly NodePowerResult[];
  branches: readonly BranchPowerResult[];
  loads: readonly LoadPowerResult[];
  sources: readonly SourcePowerResult[];
  options: PowerSolverOptions;
  shedLoadIds: ReadonlySet<StableId>;
}): PowerMetrics {
  const totalRequestedLoadWatts = input.loads.reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0);
  const totalDeliveredLoadWatts = input.loads.reduce((sum, load) => sum + Math.max(0, load.deliveredWatts), 0);
  const totalSourceWatts = input.sources.reduce((sum, source) => sum + Math.max(0, source.deliveredWatts), 0);
  const totalConductorLossWatts = input.branches.reduce((sum, branch) => sum + Math.max(0, branch.powerLossWatts), 0);
  const unservedWatts = input.loads
    .filter((load) => load.state === "shed" || load.state === "undervoltage" || load.state === "disconnected" || load.state === "infeasible")
    .reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0);
  const worstBranch = [...input.branches].sort((left, right) => {
    const utilizationCompare = right.utilization - left.utilization;
    return Math.abs(utilizationCompare) > 1e-9 ? utilizationCompare : left.id.localeCompare(right.id);
  })[0];
  const minimumNodeVoltage = Math.min(...input.nodes.map((node) => node.voltage));
  const nominalVoltage = input.sources[0]?.nominalVoltage ?? 1;
  const lowestSourceVoltage = Math.min(...input.sources.map((source) => source.nominalVoltage));
  const worstVoltageDropPercent = input.sources.length > 0
    ? ((lowestSourceVoltage - minimumNodeVoltage) / nominalVoltage) * 100
    : 100;
  const shedLoads = input.loads.filter((load) => load.state === "shed");
  const undervoltageLoads = input.loads.filter((load) => load.state === "undervoltage" || load.state === "disconnected" || load.state === "infeasible");
  const powerBalanceResidualWatts = round(totalSourceWatts - totalDeliveredLoadWatts - totalConductorLossWatts);
  const sourceWattageHeadroom = input.sources.reduce((sum, source) => sum + source.wattageHeadroom, 0);
  const sourceCurrentHeadroom = input.sources.reduce((sum, source) => sum + source.currentHeadroom, 0);
  const branchHeadroomWatts = input.branches
    .filter((branch) => branch.enabled)
    .map((branch) => Math.max(0, branch.currentLimitAmps - branch.absCurrentAmps) * nominalVoltage)
    .sort((left, right) => left - right)[0] ?? 0;
  const estimatedAdditionalLoadMarginWatts = Math.max(0, Math.min(sourceWattageHeadroom, branchHeadroomWatts));

  const metrics = {
    networkState: "nominal" as NetworkState,
    converged: input.converged,
    iterationCount: input.iterationCount,
    maxVoltageDelta: round(input.maxVoltageDelta),
    minimumNodeVoltage: round(minimumNodeVoltage),
    worstVoltageDropPercent: round(Math.max(0, worstVoltageDropPercent)),
    worstBranchId: worstBranch?.id,
    worstBranchUtilization: round(worstBranch?.utilization ?? 0),
    totalRequestedLoadWatts: round(totalRequestedLoadWatts),
    totalDeliveredLoadWatts: round(totalDeliveredLoadWatts),
    totalSourceWatts: round(totalSourceWatts),
    totalConductorLossWatts: round(totalConductorLossWatts),
    conductorLossPercent: round(totalSourceWatts > 0 ? (totalConductorLossWatts / totalSourceWatts) * 100 : 0),
    unservedWatts: round(unservedWatts),
    powerBalanceResidualWatts,
    shedLoadCount: shedLoads.length,
    shedWatts: round(shedLoads.reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0)),
    undervoltageLoadCount: undervoltageLoads.length,
    undervoltageWatts: round(undervoltageLoads.reduce((sum, load) => sum + Math.max(0, load.requestedWatts), 0)),
    sourceWattageHeadroom: round(sourceWattageHeadroom),
    sourceCurrentHeadroom: round(sourceCurrentHeadroom),
    estimatedAdditionalLoadMarginWatts: round(estimatedAdditionalLoadMarginWatts),
  };

  metrics.networkState = classifyNetworkState(input.normalized, metrics, input.branches, input.loads, input.sources);
  return metrics;
}

function buildPowerDiagnostics(
  network: NormalizedPowerNetwork,
  metrics: PowerMetrics,
  branches: readonly BranchPowerResult[],
  loads: readonly LoadPowerResult[],
  sources: readonly SourcePowerResult[],
  options: PowerSolverOptions,
): PowerDiagnostic[] {
  const diagnostics: PowerDiagnostic[] = network.validationIssues.map((issue) => ({
    id: `power:${issue.id}`,
    severity: issue.severity,
    code: "invalid_network",
    message: issue.message,
    affectedIds: issue.affectedIds,
  }));

  for (const source of sources.filter((source) => source.utilization > 1)) {
    diagnostics.push({
      id: `power:source:${source.id}:limit`,
      severity: "error",
      code: "source_limit",
      message: `Source ${source.id} is delivering ${source.deliveredWatts} W against a ${source.maximumWatts} W limit.`,
      affectedIds: [source.id, source.nodeId],
      measured: source.deliveredWatts,
      threshold: source.maximumWatts,
      unit: "W",
    });
  }
  for (const branch of branches.filter((branch) => branch.state === "overloaded")) {
    diagnostics.push({
      id: `power:branch:${branch.id}:overcurrent`,
      severity: "error",
      code: "branch_overload",
      message: `Branch ${branch.id} is carrying ${branch.absCurrentAmps} A against a ${branch.currentLimitAmps} A limit.`,
      affectedIds: [branch.id, branch.fromNodeId, branch.toNodeId],
      measured: branch.absCurrentAmps,
      threshold: branch.currentLimitAmps,
      unit: "A",
    });
  }
  for (const load of loads) {
    if (load.state === "shed") {
      diagnostics.push({
        id: `power:load:${load.id}:shed`,
        severity: "warning",
        code: "load_shed",
        message: `Load ${load.id} was shed: ${load.sheddingReason ?? "lower-priority load shed to protect the network"}.`,
        affectedIds: [load.id, load.nodeId],
        measured: load.deliveredWatts,
        threshold: load.requestedWatts,
        unit: "W",
      });
    } else if (load.state === "undervoltage") {
      diagnostics.push({
        id: `power:load:${load.id}:brownout`,
        severity: "warning",
        code: "load_undervoltage",
        message: `Load ${load.id} receives ${load.voltage} V, below its ${load.minimumVoltage} V minimum.`,
        affectedIds: [load.id, load.nodeId],
        measured: load.voltage,
        threshold: load.minimumVoltage,
        unit: "V",
      });
    } else if (load.state === "disconnected") {
      diagnostics.push({
        id: `power:load:${load.id}:disconnected`,
        severity: "error",
        code: "load_disconnected",
        message: `Load ${load.id} is on an electrical island with no source.`,
        affectedIds: [load.id, load.nodeId],
      });
    }
  }
  for (const component of unsourcedLoadComponents(network)) {
    diagnostics.push({
      id: `power:component:${component.firstNodeId}:unsupplied`,
      severity: "error",
      code: "islanded",
      message: `Electrical component ${component.componentId} has loads but no source.`,
      affectedIds: component.affectedIds,
    });
  }
  if (!metrics.converged) {
    diagnostics.push({
      id: "power:network:non-converged",
      severity: "error",
      code: "non_converged",
      message: `Constant-power iteration did not converge after ${metrics.iterationCount} iterations.`,
      affectedIds: [],
      measured: metrics.maxVoltageDelta,
      unit: "V",
    });
  }
  if (Math.abs(metrics.powerBalanceResidualWatts) > options.powerBalanceToleranceWatts) {
    diagnostics.push({
      id: "power:network:power-balance",
      severity: "warning",
      code: "power_balance",
      message: `Power balance residual is ${metrics.powerBalanceResidualWatts} W.`,
      affectedIds: [],
      measured: metrics.powerBalanceResidualWatts,
      threshold: options.powerBalanceToleranceWatts,
      unit: "W",
    });
  }

  return diagnostics.sort((left, right) => left.id.localeCompare(right.id));
}

function classifyNetworkState(
  network: NormalizedPowerNetwork,
  metrics: PowerMetrics,
  branches: readonly BranchPowerResult[],
  loads: readonly LoadPowerResult[],
  sources: readonly SourcePowerResult[],
): NetworkState {
  if (network.validationIssues.some((issue) => issue.severity === "error")) {
    return "invalid";
  }
  if (loads.some((load) => load.state === "disconnected")) {
    return "islanded";
  }
  if (!metrics.converged) {
    return "non_converged";
  }
  if (sources.some((source) => source.utilization > 1)) {
    return "source_limited";
  }
  if (branches.some((branch) => branch.state === "overloaded")) {
    return "overloaded";
  }
  if (loads.some((load) => load.state === "undervoltage" || load.state === "infeasible")) {
    return "brownout";
  }
  if (loads.some((load) => load.state === "shed") || branches.some((branch) => branch.state === "near_limit")) {
    return "degraded";
  }
  return "nominal";
}

function branchState(utilization: number, options: PowerSolverOptions): BranchPowerResult["state"] {
  if (utilization > 1) {
    return "overloaded";
  }
  if (utilization >= options.branchNearLimitThreshold) {
    return "near_limit";
  }
  return "normal";
}

function loadState(input: {
  load: NormalizedPowerLoad;
  nodeHasSource: boolean;
  voltage: number;
  shed: boolean;
  converged: boolean;
}): LoadPowerResult["state"] {
  if (!input.load.enabled) {
    return "shed";
  }
  if (input.shed) {
    return "shed";
  }
  if (!input.nodeHasSource) {
    return "disconnected";
  }
  if (!input.converged) {
    return isProtectedTier(input.load.consumerTier) ? "infeasible" : "undervoltage";
  }
  return input.voltage >= input.load.minimumVoltage ? "served" : "undervoltage";
}

function sourceCurrentAtNode(
  nodeId: StableId,
  branches: readonly BranchPowerResult[],
  loads: readonly LoadPowerResult[],
): number {
  const branchCurrent = branches.reduce((sum, branch) => {
    if (branch.fromNodeId === nodeId) {
      return sum + branch.currentAmps;
    }
    if (branch.toNodeId === nodeId) {
      return sum - branch.currentAmps;
    }
    return sum;
  }, 0);
  const localLoadCurrent = loads
    .filter((load) => load.nodeId === nodeId && load.state !== "shed" && load.state !== "disconnected")
    .reduce((sum, load) => sum + load.currentAmps, 0);
  return branchCurrent + localLoadCurrent;
}

function tierPreserved(
  tiers: readonly TierPowerSummary[],
  tier: 0 | 1 | 2,
  protectedConstraintTier: 0 | 1 | 2 | undefined,
): boolean {
  const summary = tiers.find((candidate) => candidate.tier === tier);
  if (!summary) {
    return true;
  }
  if (protectedConstraintTier !== undefined && tier >= protectedConstraintTier && summary.requestedWatts > 0) {
    return false;
  }
  return summary.shedCount === 0 && summary.undervoltageCount === 0;
}

function highestProtectedTierNotFullyServed(
  tiers: readonly TierPowerSummary[],
  protectedConstraintTier: 0 | 1 | 2 | undefined,
): 0 | 1 | 2 | undefined {
  if (protectedConstraintTier !== undefined) {
    return protectedConstraintTier;
  }
  for (const tier of [0, 1, 2] as const) {
    if (!tierPreserved(tiers, tier, undefined)) {
      return tier;
    }
  }
  return undefined;
}

function protectedConstraintTierFromDecisions(
  decisions: readonly SheddingDecision[],
): 0 | 1 | 2 | undefined {
  const protectedTiers = decisions
    .filter((decision) => decision.reasonCode === "protected_constraint_violation" && isProtectedTier(decision.consumerTier))
    .map((decision) => decision.consumerTier as 0 | 1 | 2)
    .sort((left, right) => left - right);
  return protectedTiers[0];
}

function unsourcedLoadComponents(network: NormalizedPowerNetwork): {
  componentId: StableId;
  firstNodeId: StableId;
  affectedIds: StableId[];
}[] {
  const componentLoads = new Map<StableId, StableId[]>();
  for (const load of network.loads.filter((load) => load.enabled && load.requestedWatts > 0)) {
    const node = network.nodes.find((candidate) => candidate.id === load.nodeId);
    if (node && !node.hasSource) {
      componentLoads.set(node.componentId, [...(componentLoads.get(node.componentId) ?? []), load.id, node.id]);
    }
  }
  return [...componentLoads.entries()].map(([componentId, affectedIds]) => {
    const nodeIds = network.nodes.filter((node) => node.componentId === componentId).map((node) => node.id).sort();
    return {
      componentId,
      firstNodeId: nodeIds[0] ?? componentId,
      affectedIds: [...new Set([...affectedIds, ...nodeIds])].sort(),
    };
  });
}

function isNormalizedNetwork(input: PowerNetworkInput | NormalizedPowerNetwork): input is NormalizedPowerNetwork {
  return "validationIssues" in input;
}

function groupBy<T>(values: readonly T[], keyFor: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
