import type { DeficiencyGate } from "@atos/dispatch";
import type {
  DeficiencyCarryForwardRecord,
  DeficiencyCarryForwardResult,
  InfrastructureFinding,
} from "./types";

const severityRank = {
  info: 0,
  warning: 1,
  error: 2,
} as const;

export function carryForwardDeficiencies(
  previous: readonly DeficiencyGate[],
  revised: readonly DeficiencyGate[],
): DeficiencyCarryForwardResult {
  const revisedById = new Map(revised.map((gate) => [gate.id, gate]));
  const revisedByChit = new Map(revised.map((gate) => [chitKey(gate), gate]));
  const consumedRevised = new Set<string>();
  const records: DeficiencyCarryForwardRecord[] = [];

  for (const oldGate of previous) {
    const same = revisedById.get(oldGate.id);
    if (same) {
      consumedRevised.add(same.id);
      records.push(recordFor(oldGate, same));
      continue;
    }
    const transformed = revisedByChit.get(chitKey(oldGate));
    if (transformed) {
      consumedRevised.add(transformed.id);
      records.push({
        id: `deficiency-carry:transformed:${oldGate.id}:${transformed.id}`,
        previousDeficiencyId: oldGate.id,
        revisedDeficiencyId: transformed.id,
        status: transformed.kind === oldGate.kind ? "superseded" : "transformed",
        kind: transformed.kind,
        chitIds: transformed.chitIds.slice().sort(),
        rationale: `Deficiency ${oldGate.id} changed to ${transformed.kind}.`,
      });
      continue;
    }
    records.push({
      id: `deficiency-carry:resolved:${oldGate.id}`,
      previousDeficiencyId: oldGate.id,
      status: "resolved",
      kind: oldGate.kind,
      chitIds: oldGate.chitIds.slice().sort(),
      rationale: `Deficiency ${oldGate.id} is absent from the revised plan.`,
    });
  }

  for (const newGate of revised) {
    if (!consumedRevised.has(newGate.id)) {
      records.push({
        id: `deficiency-carry:new:${newGate.id}`,
        revisedDeficiencyId: newGate.id,
        status: "new",
        kind: newGate.kind,
        chitIds: newGate.chitIds.slice().sort(),
        rationale: `Deficiency ${newGate.id} was introduced by the revised plan.`,
      });
    }
  }

  return {
    records: records.sort((left, right) => left.id.localeCompare(right.id)),
    infrastructureFindings: aggregateInfrastructureFindings([...previous, ...revised]),
  };
}

function recordFor(previous: DeficiencyGate, revised: DeficiencyGate): DeficiencyCarryForwardRecord {
  let status: DeficiencyCarryForwardRecord["status"] = "unchanged";
  if (severityRank[revised.severity] > severityRank[previous.severity]) {
    status = "worsened";
  }
  return {
    id: `deficiency-carry:${status}:${previous.id}`,
    previousDeficiencyId: previous.id,
    revisedDeficiencyId: revised.id,
    status,
    kind: revised.kind,
    chitIds: revised.chitIds.slice().sort(),
    rationale: status === "worsened"
      ? `Deficiency ${previous.id} increased from ${previous.severity} to ${revised.severity}.`
      : `Deficiency ${previous.id} remains active with the same severity.`,
  };
}

function aggregateInfrastructureFindings(gates: readonly DeficiencyGate[]): InfrastructureFinding[] {
  const groups = new Map<string, DeficiencyGate[]>();
  for (const gate of gates) {
    const key = `${gate.kind}:${gate.action}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(gate);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => {
      const [kind] = key.split(":");
      const deficiencyIds = [...new Set(bucket.map((gate) => gate.id))].sort();
      const affectedIds = [...new Set(bucket.flatMap((gate) => gate.affectedIds))].sort();
      return {
        id: `infrastructure-finding:${key.replaceAll(" ", "-")}`,
        kind: kind as DeficiencyGate["kind"],
        recurrenceCount: bucket.length,
        deficiencyIds,
        affectedIds,
        summary: `${bucket.length} recurring ${kind?.replaceAll("_", " ")} deficiencies point to ${bucket[0]?.action ?? "an infrastructure constraint"}.`,
      };
    })
    .sort((left, right) => right.recurrenceCount - left.recurrenceCount || left.id.localeCompare(right.id));
}

function chitKey(gate: DeficiencyGate): string {
  return gate.chitIds.slice().sort().join("|");
}
