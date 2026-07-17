import type { DeficiencyGate } from "@atos/dispatch";
import type {
  ReplanningRequest,
  SimulationEvent,
  SimulationRuntimeState,
} from "./types";

export function createReplanningRequest(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  reason: string,
  deficiency?: DeficiencyGate,
): ReplanningRequest {
  const mission = state.missions.find((candidate) => candidate.plan.id === event.missionId);
  const missionReservationIds = mission
    ? state.reservations
      .filter((reservation) => reservation.reservation.missionPlanId === mission.plan.id)
      .map((reservation) => reservation.reservation.id)
      .sort()
    : [];
  const releasedReservationIds = state.reservations
    .filter((reservation) => missionReservationIds.includes(reservation.reservation.id) && reservation.status === "released")
    .map((reservation) => reservation.reservation.id)
    .sort();

  return {
    id: `replan:${event.id}`,
    status: "requested",
    currentTime: event.timestamp,
    triggeredByEventId: event.id,
    missionId: event.missionId,
    chitIds: mission?.plan.chitIds ?? [],
    affectedAssetIds: event.affectedAssetIds,
    releasedReservationIds,
    retainedReservationIds: missionReservationIds.filter((id) => !releasedReservationIds.includes(id)),
    assetStates: state.assets
      .filter((asset) => event.affectedAssetIds.includes(asset.assetId) || mission?.plan.assetIds.includes(asset.assetId))
      .sort((left, right) => left.assetId.localeCompare(right.assetId)),
    reason,
    deficiency,
  };
}
