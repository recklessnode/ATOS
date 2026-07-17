import type { IsoDateTimeString, StableId } from "@atos/domain";
import type {
  SimulationEvent,
  SimulationEventFilter,
  SimulationEventPayload,
  SimulationEventSeverity,
  SimulationEventStatus,
  SimulationEventType,
  SimulationRuntimeState,
} from "./types";

export type ScheduleEventInput = {
  timestamp: IsoDateTimeString;
  type: SimulationEventType;
  missionId?: StableId;
  workerId?: StableId;
  transientWorkerId?: StableId;
  affectedAssetIds?: readonly StableId[];
  affectedResourceIds?: readonly StableId[];
  causalEventId?: StableId;
  payload?: SimulationEventPayload;
  severity?: SimulationEventSeverity;
  status?: SimulationEventStatus;
};

const EVENT_ORDER: Record<SimulationEventType, number> = {
  fault_raised: 0,
  fault_cleared: 1,
  mission_accepted: 10,
  formation_started: 20,
  consist_join_started: 21,
  consist_join_completed: 22,
  formation_completed: 23,
  loading_started: 30,
  loading_completed: 31,
  departure_requested: 40,
  power_gate_failed: 41,
  departure_delayed: 42,
  departure_authorized: 43,
  guideway_segment_entered: 50,
  guideway_segment_exited: 51,
  station_arrived: 60,
  unloading_started: 70,
  unloading_completed: 71,
  charging_started: 80,
  charging_completed: 81,
  maintenance_started: 82,
  maintenance_completed: 83,
  consist_split_started: 90,
  consist_split_completed: 91,
  mission_completed: 100,
  reservation_conflict: 110,
  route_blocked: 111,
  battery_reserve_violated: 112,
  mission_failed: 120,
  replanning_requested: 130,
};

export function scheduleEvent(
  state: SimulationRuntimeState,
  input: ScheduleEventInput,
): SimulationRuntimeState {
  const event = createSimulationEvent(input, nextSequence(state));
  return {
    ...state,
    eventQueue: orderedEventQueue([...state.eventQueue, event]),
  };
}

export function createSimulationEvent(
  input: ScheduleEventInput,
  sequence: number,
): SimulationEvent {
  const missionPart = input.missionId ?? "global";
  const event: SimulationEvent = {
    id: stableEventId(input.timestamp, input.type, missionPart, sequence),
    sequence,
    timestamp: input.timestamp,
    type: input.type,
    affectedAssetIds: uniqueSorted(input.affectedAssetIds ?? []),
    affectedResourceIds: uniqueSorted(input.affectedResourceIds ?? []),
    payload: input.payload ?? {},
    severity: input.severity ?? "info",
    status: input.status ?? "scheduled",
  };
  if (input.missionId) {
    event.missionId = input.missionId;
  }
  if (input.workerId) {
    event.workerId = input.workerId;
  }
  if (input.transientWorkerId) {
    event.transientWorkerId = input.transientWorkerId;
  }
  if (input.causalEventId) {
    event.causalEventId = input.causalEventId;
  }
  return event;
}

export function popNextEvent(state: SimulationRuntimeState): {
  event?: SimulationEvent;
  state: SimulationRuntimeState;
} {
  const [event, ...eventQueue] = orderedEventQueue(state.eventQueue);
  return { event, state: { ...state, eventQueue } };
}

export function orderedEventQueue(events: readonly SimulationEvent[]): SimulationEvent[] {
  return [...events].sort(compareSimulationEvents);
}

export function compareSimulationEvents(left: SimulationEvent, right: SimulationEvent): number {
  const timeCompare = Date.parse(left.timestamp) - Date.parse(right.timestamp);
  if (timeCompare !== 0) {
    return timeCompare;
  }
  const orderCompare = EVENT_ORDER[left.type] - EVENT_ORDER[right.type];
  if (orderCompare !== 0) {
    return orderCompare;
  }
  const missionCompare = (left.missionId ?? "").localeCompare(right.missionId ?? "");
  if (missionCompare !== 0) {
    return missionCompare;
  }
  const resourceCompare = left.affectedResourceIds.join("|").localeCompare(right.affectedResourceIds.join("|"));
  if (resourceCompare !== 0) {
    return resourceCompare;
  }
  return left.sequence - right.sequence;
}

export function appendAppliedEvent(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const currentTime = Date.parse(state.clock.currentTime) > Date.parse(event.timestamp)
    ? state.clock.currentTime
    : event.timestamp;
  return {
    ...state,
    clock: {
      ...state.clock,
      currentTime,
      processedEventCount: state.clock.processedEventCount + 1,
    },
    eventHistory: [...state.eventHistory, { ...event, status: "applied" }],
  };
}

export function filterSimulationEvents(
  events: readonly SimulationEvent[],
  filter: SimulationEventFilter,
): SimulationEvent[] {
  return orderedEventQueue(events).filter((event) =>
    (!filter.missionId || event.missionId === filter.missionId) &&
    (!filter.assetId || event.affectedAssetIds.includes(filter.assetId)) &&
    (!filter.eventType || event.type === filter.eventType) &&
    (!filter.severity || event.severity === filter.severity) &&
    (!filter.resourceId || event.affectedResourceIds.includes(filter.resourceId)) &&
    (!filter.causalEventId || event.causalEventId === filter.causalEventId) &&
    (!filter.fromTime || Date.parse(event.timestamp) >= Date.parse(filter.fromTime)) &&
    (!filter.toTime || Date.parse(event.timestamp) <= Date.parse(filter.toTime))
  );
}

export function serializeEventLog(events: readonly SimulationEvent[]): string {
  return JSON.stringify(events);
}

export function parseEventLog(serialized: string): SimulationEvent[] {
  return JSON.parse(serialized) as SimulationEvent[];
}

function nextSequence(state: SimulationRuntimeState): number {
  const last = [...state.eventQueue, ...state.eventHistory]
    .reduce((max, event) => Math.max(max, event.sequence), 0);
  return last + 1;
}

function stableEventId(
  timestamp: IsoDateTimeString,
  type: SimulationEventType,
  missionPart: StableId,
  sequence: number,
): StableId {
  const timePart = timestamp.replace(/[^0-9]/g, "").slice(0, 14);
  return `event:${timePart}:${sequence.toString().padStart(4, "0")}:${type}:${sanitize(missionPart)}`;
}

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "") || "global";
}

function uniqueSorted(values: readonly StableId[]): StableId[] {
  return [...new Set(values)].sort();
}
