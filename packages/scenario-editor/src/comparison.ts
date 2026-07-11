import type { PowerAnalysisResult } from "@atos/power";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import type { ScenarioComparison, ScenarioComparisonMetric } from "./types";

export function compareScenarios(
  beforeDocument: ScenarioDocumentV1,
  beforePower: PowerAnalysisResult,
  afterDocument: ScenarioDocumentV1,
  afterPower: PowerAnalysisResult,
): ScenarioComparison {
  return {
    metrics: [
      metric("minimumNodeVoltage", "Minimum node voltage", beforePower.metrics.minimumNodeVoltage, afterPower.metrics.minimumNodeVoltage, "V"),
      metric("worstVoltageDropPercent", "Worst voltage drop", beforePower.metrics.worstVoltageDropPercent, afterPower.metrics.worstVoltageDropPercent, "%"),
      metric("worstBranchUtilization", "Worst branch utilization", beforePower.metrics.worstBranchUtilization * 100, afterPower.metrics.worstBranchUtilization * 100, "%"),
      metric("sourceUtilization", "Source utilization", (beforePower.sources[0]?.utilization ?? 0) * 100, (afterPower.sources[0]?.utilization ?? 0) * 100, "%"),
      metric("conductorLoss", "Conductor loss", beforePower.metrics.totalConductorLossWatts, afterPower.metrics.totalConductorLossWatts, "W"),
      metric("deliveredPower", "Delivered power", beforePower.metrics.totalDeliveredLoadWatts, afterPower.metrics.totalDeliveredLoadWatts, "W"),
      metric("unservedPower", "Unserved power", beforePower.metrics.unservedWatts, afterPower.metrics.unservedWatts, "W"),
      metric("shedLoadCount", "Shed load count", beforePower.metrics.shedLoadCount, afterPower.metrics.shedLoadCount),
      metric("shedWatts", "Shed watts", beforePower.metrics.shedWatts, afterPower.metrics.shedWatts, "W"),
      {
        id: "highestProtectedTierNotFullyServed",
        label: "Highest protected tier shortfall",
        before: beforePower.highestProtectedTierNotFullyServed ?? "none",
        after: afterPower.highestProtectedTierNotFullyServed ?? "none",
      },
      {
        id: "networkState",
        label: "Network state",
        before: beforePower.metrics.networkState,
        after: afterPower.metrics.networkState,
      },
    ],
    changedTiles: changedIds(beforeDocument.layout.tiles, afterDocument.layout.tiles),
    changedSetPieces: changedIds(beforeDocument.layout.setPieces, afterDocument.layout.setPieces),
    changedSources: changedIds(beforePower.sources, afterPower.sources),
    changedBranches: changedIds(beforePower.branches, afterPower.branches),
    changedLoads: changedIds(beforePower.loads, afterPower.loads),
  };
}

function metric(id: string, label: string, before: number, after: number, unit?: string): ScenarioComparisonMetric {
  return {
    id,
    label,
    before: round(before),
    after: round(after),
    delta: round(after - before),
    unit,
  };
}

function changedIds<T extends { id: string }>(before: readonly T[], after: readonly T[]): string[] {
  const beforeById = new Map(before.map((value) => [value.id, stableJson(value)]));
  const afterById = new Map(after.map((value) => [value.id, stableJson(value)]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  return [...ids].filter((id) => beforeById.get(id) !== afterById.get(id)).sort();
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sortKeys(nested)]));
  }
  return value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
