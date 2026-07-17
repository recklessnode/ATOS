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
  const vehicleAssets = runtime.assets.filter((asset) => asset.kind === "vehicle");
  const activeAssets = vehicleAssets.filter((asset) => asset.activeMissionId || asset.consistId);
  const reservationConflictEvents = runtime.eventHistory.filter((event) => event.type === "reservation_conflict");
  const energyDelayCount = runtime.eventHistory.filter((event) =>
    event.type === "power_gate_failed" || event.type === "battery_reserve_violated" || String(event.payload.reason ?? "").toLowerCase().includes("energy")
  ).length;

  return {
    simulatedHours,
    replansPerSimulatedHour: replanCount / simulatedHours,
    missionCompletionRate: rate(completed.length, runtime.missions.length),
    onTimeCompletionRate: rate(onTime.length, completed.length),
    averageQueueWaitMinutes: average(runtime.missions.map((mission) =>
      mission.startedAt ? Math.max(0, Date.parse(mission.startedAt) - Date.parse(mission.plan.startsAt)) / 60_000 : 0
    )),
    averagePassengerWaitMinutes: average(runtime.missions
      .filter((mission) => mission.plan.chitIds.some((id) => id.includes("commuter") || id.includes("express")))
      .map((mission) => mission.startedAt ? Math.max(0, Date.parse(mission.startedAt) - Date.parse(mission.plan.startsAt)) / 60_000 : 0)),
    averageCargoLatenessMinutes: average(runtime.missions
      .filter((mission) => mission.plan.chitIds.some((id) => id.includes("cargo")))
      .map((mission) => mission.completedAt ? Math.max(0, Date.parse(mission.completedAt) - Date.parse(mission.plan.endsAt)) / 60_000 : 0)),
    assetUtilization: rate(activeAssets.length, vehicleAssets.length),
    emptyMovementShare: 0,
    reservationConflictRate: rate(reservationConflictEvents.length, Math.max(runtime.reservations.length, 1)),
    energyDelayCount,
    missionFailuresByCause: failureCounts(runtime),
    deficiencyRecurrence: deficiencyRecurrence(generations),
    planningChurn: generations.length <= 1 ? 0 : (generations.at(-1)?.dispatchResult.missionPlans.length ?? 0) / Math.max(generations[0]?.dispatchResult.missionPlans.length ?? 1, 1),
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
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
