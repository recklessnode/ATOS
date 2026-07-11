import { consumerTierForLoadClass } from "./tier-policy";
import type {
  NormalizedPowerBranch,
  NormalizedPowerLoad,
  NormalizedPowerNetwork,
  NormalizedPowerNode,
  NormalizedPowerSource,
  PowerNetworkInput,
  PowerValidationIssue,
  StableId,
} from "./types";

export function normalizeElectricalGraph(input: PowerNetworkInput): NormalizedPowerNetwork {
  const validationIssues: PowerValidationIssue[] = [];
  const nodes = normalizeNodes(input.nodes, validationIssues);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const branches = normalizeBranches(input.branches, nodeIds, validationIssues);
  const sources = normalizeSources(input.sources, nodeIds, validationIssues);
  const loads = normalizeLoads(input.loads, nodeIds, validationIssues);
  const componentIds = assignComponents(nodes, branches, sources);

  return {
    nodes: nodes.map((node) => ({
      ...node,
      componentId: componentIds.componentByNodeId.get(node.id) ?? `component:${node.id}`,
      hasSource: componentIds.sourcedComponents.has(componentIds.componentByNodeId.get(node.id) ?? ""),
    })),
    branches,
    sources,
    loads,
    validationIssues: validationIssues.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function normalizeNodes(
  inputNodes: PowerNetworkInput["nodes"],
  validationIssues: PowerValidationIssue[],
): NormalizedPowerNode[] {
  const seen = new Set<StableId>();
  const nodes = [...inputNodes].sort((left, right) => left.id.localeCompare(right.id)).map((node) => {
    if (seen.has(node.id)) {
      validationIssues.push({
        id: `power-validation:duplicate-node:${node.id}`,
        severity: "error",
        code: "duplicate_id",
        message: `Duplicate electrical node id ${node.id}.`,
        affectedIds: [node.id],
      });
    }
    seen.add(node.id);
    return {
      id: node.id,
      tileId: node.tileId ?? "",
      localNodeId: node.localNodeId ?? "",
      componentId: "",
      hasSource: false,
    };
  });

  return nodes;
}

function normalizeBranches(
  inputBranches: PowerNetworkInput["branches"],
  nodeIds: ReadonlySet<StableId>,
  validationIssues: PowerValidationIssue[],
): NormalizedPowerBranch[] {
  const seen = new Set<StableId>();
  return [...inputBranches].sort((left, right) => left.id.localeCompare(right.id)).map((branch) => {
    if (seen.has(branch.id)) {
      validationIssues.push({
        id: `power-validation:duplicate-branch:${branch.id}`,
        severity: "error",
        code: "duplicate_id",
        message: `Duplicate electrical branch id ${branch.id}.`,
        affectedIds: [branch.id],
      });
    }
    seen.add(branch.id);
    if (!nodeIds.has(branch.fromNodeId) || !nodeIds.has(branch.toNodeId)) {
      validationIssues.push({
        id: `power-validation:missing-branch-node:${branch.id}`,
        severity: "error",
        code: "missing_node",
        message: `Branch ${branch.id} references a missing node.`,
        affectedIds: [branch.id, branch.fromNodeId, branch.toNodeId],
      });
    }
    if (!Number.isFinite(branch.resistanceOhms) || branch.resistanceOhms <= 0) {
      validationIssues.push({
        id: `power-validation:invalid-resistance:${branch.id}`,
        severity: "error",
        code: "invalid_resistance",
        message: `Branch ${branch.id} must have positive finite resistance.`,
        affectedIds: [branch.id],
      });
    }
    if (!Number.isFinite(branch.currentLimitAmps) || branch.currentLimitAmps <= 0) {
      validationIssues.push({
        id: `power-validation:invalid-current-limit:${branch.id}`,
        severity: "error",
        code: "invalid_current_limit",
        message: `Branch ${branch.id} must have positive finite current limit.`,
        affectedIds: [branch.id],
      });
    }

    return {
      id: branch.id,
      fromNodeId: branch.fromNodeId,
      toNodeId: branch.toNodeId,
      resistanceOhms: branch.resistanceOhms,
      currentLimitAmps: branch.currentLimitAmps,
      enabled: branch.enabled,
      kind: branch.kind ?? "branch",
    };
  });
}

function normalizeSources(
  inputSources: PowerNetworkInput["sources"],
  nodeIds: ReadonlySet<StableId>,
  validationIssues: PowerValidationIssue[],
): NormalizedPowerSource[] {
  const seen = new Set<StableId>();
  const sources = [...inputSources].sort((left, right) => left.id.localeCompare(right.id)).map((source) => {
    if (seen.has(source.id)) {
      validationIssues.push({
        id: `power-validation:duplicate-source:${source.id}`,
        severity: "error",
        code: "duplicate_id",
        message: `Duplicate electrical source id ${source.id}.`,
        affectedIds: [source.id],
      });
    }
    seen.add(source.id);
    if (!nodeIds.has(source.nodeId)) {
      validationIssues.push({
        id: `power-validation:missing-source-node:${source.id}`,
        severity: "error",
        code: "missing_node",
        message: `Source ${source.id} references missing node ${source.nodeId}.`,
        affectedIds: [source.id, source.nodeId],
      });
    }
    if (!Number.isFinite(source.nominalVoltage) || source.nominalVoltage <= 0) {
      validationIssues.push({
        id: `power-validation:invalid-source-voltage:${source.id}`,
        severity: "error",
        code: "invalid_source_voltage",
        message: `Source ${source.id} must have positive finite nominal voltage.`,
        affectedIds: [source.id],
      });
    }
    if (!Number.isFinite(source.maximumWatts) || source.maximumWatts <= 0) {
      validationIssues.push({
        id: `power-validation:invalid-source-power:${source.id}`,
        severity: "error",
        code: "invalid_source_power",
        message: `Source ${source.id} must have positive finite maximum watts.`,
        affectedIds: [source.id],
      });
    }
    return {
      id: source.id,
      nodeId: source.nodeId,
      nominalVoltage: source.nominalVoltage,
      maximumWatts: source.maximumWatts,
    };
  });

  for (const [nodeId, nodeSources] of groupBy(sources, (source) => source.nodeId)) {
    const voltages = new Set(nodeSources.map((source) => source.nominalVoltage));
    if (voltages.size > 1) {
      validationIssues.push({
        id: `power-validation:conflicting-source:${nodeId}`,
        severity: "error",
        code: "conflicting_sources",
        message: `Node ${nodeId} has ideal sources with conflicting voltages.`,
        affectedIds: nodeSources.map((source) => source.id),
      });
    }
  }

  return sources;
}

function normalizeLoads(
  inputLoads: PowerNetworkInput["loads"],
  nodeIds: ReadonlySet<StableId>,
  validationIssues: PowerValidationIssue[],
): NormalizedPowerLoad[] {
  const seen = new Set<StableId>();
  return [...inputLoads].sort((left, right) => left.id.localeCompare(right.id)).map((load) => {
    if (seen.has(load.id)) {
      validationIssues.push({
        id: `power-validation:duplicate-load:${load.id}`,
        severity: "error",
        code: "duplicate_id",
        message: `Duplicate electrical load id ${load.id}.`,
        affectedIds: [load.id],
      });
    }
    seen.add(load.id);
    if (!nodeIds.has(load.nodeId)) {
      validationIssues.push({
        id: `power-validation:missing-load-node:${load.id}`,
        severity: "error",
        code: "missing_node",
        message: `Load ${load.id} references missing node ${load.nodeId}.`,
        affectedIds: [load.id, load.nodeId],
      });
    }
    if (
      !Number.isFinite(load.requestedWatts) ||
      !Number.isFinite(load.minimumVoltage) ||
      load.minimumVoltage < 0 ||
      !Number.isFinite(load.sheddingPriority)
    ) {
      validationIssues.push({
        id: `power-validation:invalid-load:${load.id}`,
        severity: "error",
        code: "invalid_load",
        message: `Load ${load.id} has invalid watts, minimum voltage, or shedding priority.`,
        affectedIds: [load.id],
      });
    }
    if (
      load.model === "constant_resistance" &&
      (!Number.isFinite(load.resistanceOhms) || (load.resistanceOhms ?? 0) <= 0)
    ) {
      validationIssues.push({
        id: `power-validation:invalid-load-resistance:${load.id}`,
        severity: "error",
        code: "invalid_resistance",
        message: `Constant-resistance load ${load.id} must have positive finite resistance.`,
        affectedIds: [load.id],
      });
    }

    return {
      id: load.id,
      nodeId: load.nodeId,
      requestedWatts: load.requestedWatts,
      minimumVoltage: load.minimumVoltage,
      loadClass: load.loadClass,
      sheddingPriority: load.sheddingPriority,
      enabled: load.enabled ?? true,
      model: load.model ?? "constant_power",
      resistanceOhms: load.resistanceOhms,
      consumerTier: load.consumerTier ?? consumerTierForLoadClass(load.loadClass),
    };
  });
}

function assignComponents(
  nodes: readonly Pick<NormalizedPowerNode, "id">[],
  branches: readonly NormalizedPowerBranch[],
  sources: readonly NormalizedPowerSource[],
): {
  componentByNodeId: Map<StableId, StableId>;
  sourcedComponents: Set<StableId>;
} {
  const adjacency = new Map<StableId, StableId[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const branch of branches.filter((branch) => branch.enabled)) {
    adjacency.get(branch.fromNodeId)?.push(branch.toNodeId);
    adjacency.get(branch.toNodeId)?.push(branch.fromNodeId);
  }

  const componentByNodeId = new Map<StableId, StableId>();
  const visited = new Set<StableId>();
  const sortedNodes = [...nodes].sort((left, right) => left.id.localeCompare(right.id));
  let componentIndex = 0;

  for (const node of sortedNodes) {
    if (visited.has(node.id)) {
      continue;
    }
    componentIndex += 1;
    const componentId = `component-${componentIndex}`;
    const stack = [node.id];
    visited.add(node.id);
    while (stack.length > 0) {
      const current = stack.pop() as StableId;
      componentByNodeId.set(current, componentId);
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
  }

  const sourcedComponents = new Set<StableId>();
  for (const source of sources) {
    const componentId = componentByNodeId.get(source.nodeId);
    if (componentId) {
      sourcedComponents.add(componentId);
    }
  }

  return { componentByNodeId, sourcedComponents };
}

function groupBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}
