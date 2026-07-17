import type { DispatchChit } from "@atos/dispatch";
import type { SimulationRuntimeState } from "@atos/simulation";
import type { OperationsMetrics, PlanningGeneration } from "./types";

export function calculateOperationsMetrics(
  runtime: SimulationRuntimeState,
  generations: readonly PlanningGeneration[],
  replanCount: number,
): OperationsMetrics {
  const elapsedMs = Math.max(0, Date.parse(runtime.clock.currentTime) - Date.parse(runtime.scenario.simulation.currentTime));
  const simulatedHours = Math.max(elapsedMs / 3_600_000, 1 / 60);
  const completed = runtime.missions.filter((mission) => mission.state === "completed");
  const onTime = completed.filter((mission) =>
    mission.completedAt && Date.parse(mission.completedAt) <= Date.parse(mission.plan.endsAt)
  );
  const chitIndex = dispatchChitIndex(generations);
  const reservationConflictEvents = runtime.eventHistory.filter((event) => event.type === "reservation_conflict");
  const energyDelayCount = runtime.eventHistory.filter((event) =>
    event.type === "power_gate_failed" || event.type === "battery_reserve_violated" || String(event.payload.reason ?? "").toLowerCase().includes("energy")
  ).length;
  const queueWaits = runtime.missions.flatMap((mission) =>
    chitsForMission(mission.plan.chitIds, chitIndex).map((chit) =>
      mission.startedAt ? Math.max(0, Date.parse(mission.startedAt) - Date.parse(chit.readyAt)) / 60_000 : 0
    )
  );
  const passengerWaits = runtime.missions.flatMap((mission) =>
    chitsForMission(mission.plan.chitIds, chitIndex)
      .filter(isPassengerChit)
      .map((chit) => mission.startedAt ? Math.max(0, Date.parse(mission.startedAt) - Date.parse(chit.readyAt)) / 60_000 : 0)
  );
  const cargoLateness = runtime.missions.flatMap((mission) =>
    chitsForMission(mission.plan.chitIds, chitIndex)
      .filter(isCargoChit)
      .map((chit) => mission.completedAt ? Math.max(0, Date.parse(mission.completedAt) - Date.parse(chit.dueAt)) / 60_000 : 0)
  );

  return {
    simulatedHours,
    replansPerSimulatedHour: replanCount / simulatedHours,
    missionCompletionRate: rate(completed.length, runtime.missions.length),
    onTimeCompletionRate: rate(onTime.length, completed.length),
    averageQueueWaitMinutes: average(queueWaits),
    averagePassengerWaitMinutes: average(passengerWaits),
    averageCargoLatenessMinutes: average(cargoLateness),
    assetUtilization: assetUtilization(runtime, elapsedMs),
    emptyMovementShare: emptyMovementShare(runtime, chitIndex),
    reservationConflictRate: rate(reservationConflictEvents.length, Math.max(runtime.reservations.length, 1)),
    energyDelayCount,
    missionFailuresByCause: failureCounts(runtime),
    deficiencyRecurrence: deficiencyRecurrence(generations),
    planningChurn: planningChurn(generations),
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dispatchChitIndex(generations: readonly PlanningGeneration[]): Map<string, DispatchChit> {
  const index = new Map<string, DispatchChit>();
  for (const generation of generations) {
    for (const chit of generation.dispatchResult.normalizedChits) {
      index.set(chit.id, chit);
    }
  }
  return index;
}

function chitsForMission(chitIds: readonly string[], index: ReadonlyMap<string, DispatchChit>): DispatchChit[] {
  return chitIds
    .map((id) => index.get(id))
    .filter((chit): chit is DispatchChit => Boolean(chit));
}

function isPassengerChit(chit: DispatchChit): boolean {
  return Boolean(chit.serviceMetadata.passengerClass) || chit.kind.endsWith("-passenger");
}

function isCargoChit(chit: DispatchChit): boolean {
  return Boolean(chit.serviceMetadata.cargo) ||
    chit.kind.endsWith("-cargo") ||
    chit.kind === "maintenance-supplies";
}

function assetUtilization(runtime: SimulationRuntimeState, elapsedMs: number): number {
  const vehicleIds = new Set(runtime.assets.filter((asset) => asset.kind === "vehicle").map((asset) => asset.assetId));
  if (vehicleIds.size === 0 || elapsedMs <= 0) {
    return 0;
  }
  const busyMs = runtime.missions.reduce((sum, mission) => {
    if (!mission.startedAt) {
      return sum;
    }
    const startMs = Date.parse(mission.startedAt);
    const endMs = Date.parse(mission.completedAt ?? runtime.clock.currentTime);
    const durationMs = Math.max(0, endMs - startMs);
    const vehicleCount = mission.plan.assetIds.filter((assetId) => vehicleIds.has(assetId)).length;
    return sum + durationMs * vehicleCount;
  }, 0);
  return Math.min(1, busyMs / (vehicleIds.size * elapsedMs));
}

function emptyMovementShare(
  runtime: SimulationRuntimeState,
  chitIndex: ReadonlyMap<string, DispatchChit>,
): number {
  const totalLinks = runtime.missions.reduce((sum, mission) => sum + mission.plan.route.linkIds.length, 0);
  if (totalLinks === 0) {
    return 0;
  }
  const emptyLinks = runtime.missions
    .filter((mission) => {
      const chits = chitsForMission(mission.plan.chitIds, chitIndex);
      return chits.length === 0 || chits.every((chit) => chit.kind === "repositioning");
    })
    .reduce((sum, mission) => sum + mission.plan.route.linkIds.length, 0);
  return emptyLinks / totalLinks;
}

function planningChurn(generations: readonly PlanningGeneration[]): number {
  if (generations.length <= 1) {
    return 0;
  }
  const latest = generations.at(-1);
  const previous = generations.at(-2);
  if (latest?.planDiff && previous) {
    const changed = latest.planDiff.records.filter((record) => record.status !== "unchanged").length;
    return rate(changed, Math.max(previous.dispatchResult.missionPlans.length, 1));
  }
  return rate(
    Math.abs((latest?.dispatchResult.missionPlans.length ?? 0) - (previous?.dispatchResult.missionPlans.length ?? 0)),
    Math.max(previous?.dispatchResult.missionPlans.length ?? 1, 1),
  );
}

function failureCounts(runtime: SimulationRuntimeState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of runtime.eventHistory.filter((candidate) => candidate.type === "mission_failed" || candidate.type === "replanning_requested")) {
    const reason = String(event.payload.reason ?? event.type);
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function deficiencyRecurrence(generations: readonly PlanningGeneration[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const generation of generations) {
    for (const gate of generation.dispatchResult.deficiencyGates) {
      counts[gate.kind] = (counts[gate.kind] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
