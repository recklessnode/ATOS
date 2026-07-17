import { advanceIsoTime } from "./clock";
import type {
  GuidewayOccupancy,
  ServiceOccupancy,
  SimulationRuntimeState,
} from "./types";

export type OccupancyAcquireResult = {
  state: SimulationRuntimeState;
  acquired: boolean;
  conflict?: GuidewayOccupancy | ServiceOccupancy;
  retryAt?: string;
};

export function acquireGuidewayOccupancy(
  state: SimulationRuntimeState,
  input: {
    linkId: string;
    missionId: string;
    startTime: string;
    durationSeconds: number;
    assetIds: readonly string[];
  },
): OccupancyAcquireResult {
  const conflict = state.guidewayOccupancy.find((occupancy) =>
    occupancy.linkId === input.linkId &&
    occupancy.missionId !== input.missionId &&
    Date.parse(occupancy.exitAt) > Date.parse(input.startTime)
  );
  if (conflict) {
    return {
      state,
      acquired: false,
      conflict,
      retryAt: advanceIsoTime(conflict.exitAt, state.config.conflictRetrySeconds),
    };
  }

  const exitAt = advanceIsoTime(input.startTime, input.durationSeconds);
  const occupancy: GuidewayOccupancy = {
    id: `occupancy:guideway:${input.linkId}:${input.missionId}:${input.startTime.replace(/[^0-9]/g, "")}`,
    linkId: input.linkId,
    missionId: input.missionId,
    enteredAt: input.startTime,
    exitAt,
    assetIds: [...input.assetIds].sort(),
  };

  return {
    state: {
      ...state,
      guidewayOccupancy: [...state.guidewayOccupancy, occupancy].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
    },
    acquired: true,
  };
}

export function releaseGuidewayOccupancy(
  state: SimulationRuntimeState,
  linkId: string,
  missionId: string,
): SimulationRuntimeState {
  return {
    ...state,
    guidewayOccupancy: state.guidewayOccupancy.filter((occupancy) =>
      !(occupancy.linkId === linkId && occupancy.missionId === missionId)
    ),
  };
}

export function acquireServiceOccupancy(
  state: SimulationRuntimeState,
  input: {
    resourceId: string;
    missionId: string;
    action: ServiceOccupancy["action"];
    startTime: string;
    durationSeconds: number;
    capacityUsed?: number;
  },
): OccupancyAcquireResult {
  const capacity = serviceCapacity(state, input.resourceId);
  const overlapping = state.serviceOccupancy.filter((occupancy) =>
    occupancy.resourceId === input.resourceId &&
    occupancy.missionId !== input.missionId &&
    Date.parse(occupancy.endTime) > Date.parse(input.startTime)
  );
  const used = overlapping.reduce((sum, occupancy) => sum + occupancy.capacityUsed, 0);
  if (used + (input.capacityUsed ?? 1) > capacity) {
    const latestEnd = overlapping
      .map((occupancy) => occupancy.endTime)
      .sort()[overlapping.length - 1] ?? input.startTime;
    return {
      state,
      acquired: false,
      conflict: overlapping[0],
      retryAt: advanceIsoTime(latestEnd, state.config.conflictRetrySeconds),
    };
  }

  const occupancy: ServiceOccupancy = {
    id: `occupancy:service:${input.resourceId}:${input.missionId}:${input.startTime.replace(/[^0-9]/g, "")}`,
    resourceId: input.resourceId,
    missionId: input.missionId,
    action: input.action,
    startTime: input.startTime,
    endTime: advanceIsoTime(input.startTime, input.durationSeconds),
    capacityUsed: input.capacityUsed ?? 1,
  };

  return {
    state: {
      ...state,
      serviceOccupancy: [...state.serviceOccupancy, occupancy].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
    },
    acquired: true,
  };
}

export function releaseServiceOccupancy(
  state: SimulationRuntimeState,
  missionId: string,
  action?: ServiceOccupancy["action"],
): SimulationRuntimeState {
  return {
    ...state,
    serviceOccupancy: state.serviceOccupancy.filter((occupancy) =>
      !(occupancy.missionId === missionId && (!action || occupancy.action === action))
    ),
  };
}

export function routeLinkTravelSeconds(state: SimulationRuntimeState, linkId: string): number {
  const link = state.scenario.guideway.links.find((candidate) => candidate.id === linkId);
  const base = link?.kind === "tile-connection"
    ? state.config.connectionLinkTravelSeconds
    : state.config.internalLinkTravelSeconds;
  return base + state.config.accelerationAllowanceSeconds;
}

function serviceCapacity(state: SimulationRuntimeState, resourceId: string): number {
  if (!resourceId.startsWith("station-zone:")) {
    return 1;
  }
  const zoneId = resourceId.replace("station-zone:", "");
  return state.scenario.serviceZones.find((zone) => zone.id === zoneId)?.capacity ?? 1;
}
