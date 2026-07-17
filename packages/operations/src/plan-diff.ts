import type { MissionPlan } from "@atos/dispatch";
import type { PlanDiffInput, PlanDiffResult, MissionPlanDiff } from "./types";

export function diffDispatchPlans(input: PlanDiffInput): PlanDiffResult {
  const previousMissions = [...input.previous.missionPlans].sort(compareMission);
  const revisedMissions = [...input.revised.missionPlans].sort(compareMission);
  const revisedById = new Map(revisedMissions.map((mission) => [mission.id, mission]));
  const revisedByChitKey = new Map(revisedMissions.map((mission) => [chitKey(mission), mission]));
  const matchedRevisedIds = new Set<string>();
  const records: MissionPlanDiff[] = [];

  for (const previous of previousMissions) {
    const revised = revisedById.get(previous.id) ?? revisedByChitKey.get(chitKey(previous));
    if (!revised) {
      records.push(diffRecord({ previous }));
      continue;
    }
    matchedRevisedIds.add(revised.id);
    records.push(diffRecord({ previous, revised }));
  }

  for (const revised of revisedMissions) {
    if (!matchedRevisedIds.has(revised.id)) {
      records.push(diffRecord({ revised }));
    }
  }

  const previousSatisfied = new Set(input.previous.missionPlans.flatMap((mission) => mission.chitIds));
  const revisedSatisfied = new Set(input.revised.missionPlans.flatMap((mission) => mission.chitIds));
  const newlySatisfiedChitIds = [...revisedSatisfied].filter((id) => !previousSatisfied.has(id)).sort();
  const newlyUnsatisfiedChitIds = [...previousSatisfied].filter((id) => !revisedSatisfied.has(id)).sort();
  const sortedRecords = records.sort((left, right) => left.id.localeCompare(right.id));

  return {
    records: sortedRecords,
    unchangedMissionIds: idsByStatus(sortedRecords, "unchanged"),
    delayedMissionIds: idsByStatus(sortedRecords, "delayed"),
    cancelledMissionIds: idsByStatus(sortedRecords, "cancelled"),
    replacementMissionIds: idsByStatus(sortedRecords, "replacement"),
    newlySatisfiedChitIds,
    newlyUnsatisfiedChitIds,
    scoreDelta: input.revised.scoreBreakdown.total - input.previous.scoreBreakdown.total,
    rationale: `${sortedRecords.length} mission diff records; score delta ${(input.revised.scoreBreakdown.total - input.previous.scoreBreakdown.total).toFixed(2)}.`,
  };
}

function diffRecord({ previous, revised }: { previous?: MissionPlan; revised?: MissionPlan }): MissionPlanDiff {
  const routeChanged = Boolean(previous && revised && previous.route.linkIds.join("|") !== revised.route.linkIds.join("|"));
  const consistChanged = Boolean(previous && revised && previous.assetIds.join("|") !== revised.assetIds.join("|"));
  const reservationsChanged = Boolean(previous && revised && previous.reservationIds.join("|") !== revised.reservationIds.join("|"));
  const scoreDelta = (revised?.score.total ?? 0) - (previous?.score.total ?? 0);
  const deadlineImpactMinutes = previous && revised
    ? (Date.parse(revised.endsAt) - Date.parse(previous.endsAt)) / 60_000
    : 0;
  const powerChanged = Boolean(previous && revised && previous.launchGate.status !== revised.launchGate.status);
  const energyChanged = Boolean(previous && revised && previous.launchGate.supportAssetIds.join("|") !== revised.launchGate.supportAssetIds.join("|"));
  const status = missionStatus(previous, revised, routeChanged, consistChanged, reservationsChanged, deadlineImpactMinutes, powerChanged, scoreDelta);
  return {
    id: `plan-diff:${previous?.id ?? "new"}:${revised?.id ?? "cancelled"}`,
    status,
    previousMissionId: previous?.id,
    revisedMissionId: revised?.id,
    chitIds: [...(revised?.chitIds ?? previous?.chitIds ?? [])].sort(),
    routeChanged,
    consistChanged,
    reservationsChanged,
    deadlineImpactMinutes,
    scoreDelta,
    powerChanged,
    energyChanged,
    rationale: rationaleFor(status, { routeChanged, consistChanged, reservationsChanged, deadlineImpactMinutes, scoreDelta, powerChanged }),
  };
}

function missionStatus(
  previous: MissionPlan | undefined,
  revised: MissionPlan | undefined,
  routeChanged: boolean,
  consistChanged: boolean,
  reservationsChanged: boolean,
  deadlineImpactMinutes: number,
  powerChanged: boolean,
  scoreDelta: number,
): MissionPlanDiff["status"] {
  if (!previous && revised) {
    return "replacement";
  }
  if (previous && !revised) {
    return "cancelled";
  }
  if (deadlineImpactMinutes > 0) {
    return "delayed";
  }
  if (routeChanged || consistChanged || reservationsChanged || powerChanged || Math.abs(scoreDelta) > 0.001) {
    return "changed";
  }
  return "unchanged";
}

function rationaleFor(status: MissionPlanDiff["status"], facts: {
  routeChanged: boolean;
  consistChanged: boolean;
  reservationsChanged: boolean;
  deadlineImpactMinutes: number;
  scoreDelta: number;
  powerChanged: boolean;
}): string {
  if (status === "unchanged") {
    return "Mission route, consist, reservations, power status, deadline, and score are unchanged.";
  }
  if (status === "cancelled") {
    return "Previous mission no longer appears in the revised planning generation.";
  }
  if (status === "replacement") {
    return "Revised planning generation introduced a new mission.";
  }
  const changes = [
    facts.routeChanged ? "route" : "",
    facts.consistChanged ? "consist" : "",
    facts.reservationsChanged ? "reservations" : "",
    facts.powerChanged ? "power gate" : "",
    facts.deadlineImpactMinutes > 0 ? `${facts.deadlineImpactMinutes.toFixed(1)} minute delay` : "",
    Math.abs(facts.scoreDelta) > 0.001 ? `score delta ${facts.scoreDelta.toFixed(2)}` : "",
  ].filter(Boolean);
  return `Mission changed: ${changes.join(", ")}.`;
}

function idsByStatus(records: readonly MissionPlanDiff[], status: MissionPlanDiff["status"]): string[] {
  return records
    .filter((record) => record.status === status)
    .map((record) => record.revisedMissionId ?? record.previousMissionId ?? record.id)
    .sort();
}

function chitKey(mission: MissionPlan): string {
  return mission.chitIds.slice().sort().join("|");
}

function compareMission(left: MissionPlan, right: MissionPlan): number {
  return left.id.localeCompare(right.id);
}
