import type {
  NormalizedPowerLoad,
  NormalizedPowerNetwork,
  StableId,
} from "./types";

export type ConductanceSystem = {
  unknownNodeIds: StableId[];
  matrix: number[][];
  rhs: number[];
};

export function buildConductanceMatrix(
  network: NormalizedPowerNetwork,
  loadCurrentsByNodeId: ReadonlyMap<StableId, number> = new Map(),
): ConductanceSystem {
  const fixedVoltages = fixedVoltagesByNodeId(network);
  const unknownNodeIds = network.nodes
    .filter((node) => node.hasSource && !fixedVoltages.has(node.id))
    .map((node) => node.id)
    .sort();
  const unknownIndexByNodeId = new Map(unknownNodeIds.map((nodeId, index) => [nodeId, index]));
  const matrix = unknownNodeIds.map(() => unknownNodeIds.map(() => 0));
  const rhs = unknownNodeIds.map((nodeId) => -(loadCurrentsByNodeId.get(nodeId) ?? 0));

  for (const load of network.loads.filter(
    (load) => load.enabled && load.model === "constant_resistance" && load.resistanceOhms !== undefined,
  )) {
    const row = unknownIndexByNodeId.get(load.nodeId);
    if (row !== undefined) {
      matrix[row][row] += 1 / (load.resistanceOhms as number);
    }
  }

  for (const branch of network.branches.filter((branch) => branch.enabled)) {
    const conductance = 1 / branch.resistanceOhms;
    const fromRow = unknownIndexByNodeId.get(branch.fromNodeId);
    const toRow = unknownIndexByNodeId.get(branch.toNodeId);
    const fromFixed = fixedVoltages.get(branch.fromNodeId);
    const toFixed = fixedVoltages.get(branch.toNodeId);

    if (fromRow !== undefined) {
      matrix[fromRow][fromRow] += conductance;
      if (toRow !== undefined) {
        matrix[fromRow][toRow] -= conductance;
      } else if (toFixed !== undefined) {
        rhs[fromRow] += conductance * toFixed;
      }
    }

    if (toRow !== undefined) {
      matrix[toRow][toRow] += conductance;
      if (fromRow !== undefined) {
        matrix[toRow][fromRow] -= conductance;
      } else if (fromFixed !== undefined) {
        rhs[toRow] += conductance * fromFixed;
      }
    }
  }

  return { unknownNodeIds, matrix, rhs };
}

export function solveLinearSystem(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index] ?? 0]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    let pivotAbs = Math.abs(augmented[pivot]?.[pivot] ?? 0);
    for (let row = pivot + 1; row < size; row += 1) {
      const candidateAbs = Math.abs(augmented[row]?.[pivot] ?? 0);
      if (candidateAbs > pivotAbs) {
        pivotRow = row;
        pivotAbs = candidateAbs;
      }
    }

    if (pivotAbs < 1e-12) {
      throw new Error("Singular conductance matrix.");
    }

    if (pivotRow !== pivot) {
      const current = augmented[pivot] as number[];
      augmented[pivot] = augmented[pivotRow] as number[];
      augmented[pivotRow] = current;
    }

    const pivotValue = augmented[pivot]?.[pivot] ?? 1;
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] = (augmented[pivot]?.[column] ?? 0) / pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = augmented[row]?.[pivot] ?? 0;
      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] = (augmented[row]?.[column] ?? 0) - factor * (augmented[pivot]?.[column] ?? 0);
      }
    }
  }

  return augmented.map((row) => row[size] ?? 0);
}

export function fixedVoltagesByNodeId(network: Pick<NormalizedPowerNetwork, "sources">): Map<StableId, number> {
  const fixedVoltages = new Map<StableId, number>();
  for (const source of network.sources) {
    fixedVoltages.set(source.nodeId, source.nominalVoltage);
  }
  return fixedVoltages;
}

export function loadCurrentAtVoltage(load: NormalizedPowerLoad, voltage: number, regularizationVoltageFloor: number): number {
  if (!load.enabled) {
    return 0;
  }
  if (load.model === "constant_resistance") {
    return load.resistanceOhms ? voltage / load.resistanceOhms : 0;
  }
  return load.requestedWatts / Math.max(Math.abs(voltage), regularizationVoltageFloor);
}
