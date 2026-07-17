import type { MissionLifecycleState, RuntimeMission } from "./types";

const TERMINAL_STATES = new Set<MissionLifecycleState>(["completed", "failed", "cancelled"]);

const ALLOWED_TRANSITIONS: Record<MissionLifecycleState, readonly MissionLifecycleState[]> = {
  planned: ["queued", "delayed", "blocked", "failed", "cancelled"],
  queued: ["forming", "delayed", "blocked", "failed", "cancelled"],
  forming: ["loading", "servicing", "delayed", "blocked", "failed", "cancelled"],
  loading: ["ready", "delayed", "blocked", "failed", "cancelled"],
  ready: ["departing", "delayed", "blocked", "failed", "cancelled"],
  departing: ["in_transit", "dwelling", "delayed", "blocked", "failed", "cancelled"],
  in_transit: ["in_transit", "dwelling", "delayed", "blocked", "failed", "cancelled"],
  dwelling: ["unloading", "delayed", "blocked", "failed", "cancelled"],
  unloading: ["servicing", "completed", "delayed", "blocked", "failed", "cancelled"],
  servicing: ["servicing", "completed", "delayed", "blocked", "failed", "cancelled"],
  delayed: ["forming", "loading", "departing", "in_transit", "unloading", "servicing", "blocked", "failed", "cancelled"],
  blocked: ["failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export type MissionLifecycleTransitionResult = {
  accepted: boolean;
  mission: RuntimeMission;
  from: MissionLifecycleState;
  to: MissionLifecycleState;
};

export function canTransitionMissionState(
  from: MissionLifecycleState,
  to: MissionLifecycleState,
): boolean {
  if (from === to) {
    return true;
  }
  if (TERMINAL_STATES.has(from)) {
    return false;
  }
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionMissionLifecycleState(
  mission: RuntimeMission,
  lifecycleState: MissionLifecycleState,
  eventId: string,
): MissionLifecycleTransitionResult {
  const accepted = canTransitionMissionState(mission.state, lifecycleState);
  return {
    accepted,
    from: mission.state,
    to: lifecycleState,
    mission: {
      ...mission,
      state: accepted ? lifecycleState : mission.state,
      eventIds: [...new Set([...mission.eventIds, eventId])].sort(),
    },
  };
}
