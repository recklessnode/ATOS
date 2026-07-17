import type { DispatchReservation } from "@atos/dispatch";
import type {
  ReservationConflictRecord,
  ReservationReconciliationInput,
  ReservationReconciliationRecord,
  ReservationReconciliationResult,
} from "./types";

export function reconcileReservations(input: ReservationReconciliationInput): ReservationReconciliationResult {
  const revisedByResource = new Map<string, DispatchReservation[]>();
  for (const reservation of input.revisedReservations) {
    const bucket = revisedByResource.get(reservation.resourceId) ?? [];
    bucket.push(reservation);
    revisedByResource.set(reservation.resourceId, bucket);
  }

  const records: ReservationReconciliationRecord[] = [];
  const activeOccupancyResourceIds = [
    ...input.runtime.guidewayOccupancy.map((occupancy) => `guideway-link:${occupancy.linkId}`),
    ...input.runtime.serviceOccupancy.map((occupancy) => occupancy.resourceId),
  ].sort();
  const activeOccupancySet = new Set(activeOccupancyResourceIds);

  for (const runtimeReservation of input.runtimeReservations) {
    const reservation = runtimeReservation.reservation;
    const matchingRevised = (revisedByResource.get(reservation.resourceId) ?? [])
      .find((candidate) => reservationsOverlap(reservation, candidate));
    const terminalMission = input.runtime.missions.find((mission) => mission.plan.id === reservation.missionPlanId &&
      ["completed", "failed", "cancelled", "blocked"].includes(mission.state)
    );

    if (activeOccupancySet.has(reservation.resourceId) && runtimeReservation.status === "active") {
      records.push(record(reservation, "active_occupancy", "Active in-transit or service occupancy is preserved until explicit release."));
    } else if (runtimeReservation.status === "released" || terminalMission) {
      records.push(record(reservation, "historical", "Reservation belongs to completed or released execution history."));
    } else if (matchingRevised) {
      records.push(record(reservation, "retained", `Still required by revised reservation ${matchingRevised.id}.`));
    } else if (runtimeReservation.status === "held" || runtimeReservation.status === "planned") {
      records.push(record(reservation, "released", "Reservation is no longer required by the revised planning generation."));
    } else {
      records.push(record(reservation, "superseded", "Reservation was replaced by a new resource or time window."));
    }
  }

  const previousIds = new Set(input.previousReservations.map((reservation) => reservation.id));
  const retainedIds = new Set(records.filter((entry) => entry.status === "retained" || entry.status === "active_occupancy").map((entry) => entry.reservationId));
  for (const revised of input.revisedReservations) {
    if (!previousIds.has(revised.id) && !retainedIds.has(revised.id)) {
      records.push(record(revised, "new", "Reservation was introduced by the revised planning generation."));
    }
  }

  const duplicateOwnershipConflicts = detectDuplicateOwnership([
    ...input.runtimeReservations
      .filter((reservation) => reservation.status === "active" || reservation.status === "held")
      .map((reservation) => reservation.reservation),
    ...input.revisedReservations,
  ], resourceCapacityIndex(input.runtime.scenario));

  return {
    records: records.sort(compareRecord),
    retainedReservationIds: idsFor(records, "retained"),
    releasedReservationIds: idsFor(records, "released"),
    supersededReservationIds: idsFor(records, "superseded"),
    newReservationIds: idsFor(records, "new"),
    activeOccupancyResourceIds,
    duplicateOwnershipConflicts,
  };
}

function record(
  reservation: DispatchReservation,
  status: ReservationReconciliationRecord["status"],
  reason: string,
): ReservationReconciliationRecord {
  return {
    id: `reservation-reconciliation:${status}:${reservation.id}`,
    reservationId: reservation.id,
    resourceId: reservation.resourceId,
    missionPlanId: reservation.missionPlanId,
    status,
    reason,
  };
}

function reservationsOverlap(left: DispatchReservation, right: DispatchReservation): boolean {
  return left.resourceId === right.resourceId &&
    Date.parse(left.startTime) < Date.parse(right.endTime) &&
    Date.parse(right.startTime) < Date.parse(left.endTime);
}

function detectDuplicateOwnership(
  reservations: readonly DispatchReservation[],
  resourceCapacity: ReadonlyMap<string, number>,
): ReservationConflictRecord[] {
  const conflicts: ReservationConflictRecord[] = [];
  const resources = [...new Set(reservations.map((reservation) => reservation.resourceId))].sort();
  for (const resourceId of resources) {
    const capacity = resourceCapacity.get(resourceId) ?? 1;
    if (!Number.isFinite(capacity)) {
      continue;
    }
    const resourceReservations = reservations
      .filter((reservation) => reservation.resourceId === resourceId)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const anchor of resourceReservations) {
      const overlapping = resourceReservations.filter((candidate) => reservationsOverlap(anchor, candidate));
      const ownerIds = new Set(overlapping.map((reservation) => reservation.missionPlanId));
      if (ownerIds.size > capacity) {
        const reservationIds = overlapping.map((reservation) => reservation.id).sort();
        const id = `reservation-conflict:${resourceId}:${reservationIds.join("+")}`;
        if (!conflicts.some((conflict) => conflict.id === id)) {
          conflicts.push({
            id,
            resourceId,
            reservationIds,
            reason: `${ownerIds.size} mission owners overlap on ${resourceId}, exceeding capacity ${capacity}.`,
          });
        }
      }
    }
  }
  return conflicts.sort((left, right) => left.id.localeCompare(right.id));
}

function resourceCapacityIndex(scenario: ReservationReconciliationInput["runtime"]["scenario"]): Map<string, number> {
  const capacity = new Map<string, number>();
  for (const zone of scenario.serviceZones) {
    capacity.set(`station-zone:${zone.id}`, zone.capacity);
  }
  for (const link of scenario.guideway.links) {
    capacity.set(`guideway-link:${link.id}`, 1);
  }
  for (const vehicle of scenario.inventory.vehicles) {
    capacity.set(`asset:${vehicle.id}`, 1);
  }
  for (const state of [
    "nominal",
    "degraded",
    "brownout",
    "overloaded",
    "source_limited",
    "non_converged",
    "islanded",
    "invalid",
  ]) {
    capacity.set(`power-window:${state}`, Number.POSITIVE_INFINITY);
  }
  return capacity;
}

function idsFor(
  records: readonly ReservationReconciliationRecord[],
  status: ReservationReconciliationRecord["status"],
): string[] {
  return records
    .filter((record) => record.status === status)
    .map((record) => record.reservationId)
    .sort();
}

function compareRecord(left: ReservationReconciliationRecord, right: ReservationReconciliationRecord): number {
  return left.status.localeCompare(right.status) || left.reservationId.localeCompare(right.reservationId);
}
