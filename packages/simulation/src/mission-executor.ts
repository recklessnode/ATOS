import { advanceClockTo, advanceIsoTime, completeClock, pauseClock, resumeClock, setPlaybackSpeed } from "./clock";
import { appendAppliedEvent, popNextEvent, scheduleEvent } from "./event-queue";
import {
  consumeMissionEnergy,
  chargeMissionAssets,
  linkEnergyWh,
  missionEnergyCheck,
} from "./energy-model";
import {
  activeFaultsForMission,
  activeFaultsForTarget,
  clearFault,
  raiseFault,
  scheduledFaultById,
} from "./faults";
import { transitionMissionLifecycleState } from "./lifecycle";
import {
  acquireGuidewayOccupancy,
  acquireServiceOccupancy,
  releaseGuidewayOccupancy,
  releaseServiceOccupancy,
  routeLinkTravelSeconds,
} from "./occupancy";
import { createReplanningRequest } from "./replanning-boundary";
import {
  activateMissionResourceReservations,
  deactivateMissionResourceReservations,
  findMission,
  holdMissionReservations,
  missionChits,
  missionReservedResourceIds,
  missionReservationCoversStart,
  missionServiceZoneResourceIds,
  releaseMissionReservations,
  updateAssets,
  updateMission,
} from "./runtime-state";
import {
  formMissionConsist,
  dissolveMissionConsist,
  startMissionConsistFormation,
  startMissionConsistSplit,
} from "./consist-actions";
import {
  loadedQuantityForChits,
  loadingDurationSeconds,
  quantityForChit,
  requiresChargingAction,
  requiresMaintenanceAction,
  unloadedQuantityForChits,
  unloadingDurationSeconds,
} from "./station-actions";
import type {
  RuntimeMission,
  ServiceOccupancy,
  SimulationEvent,
  SimulationInput,
  SimulationRuntimeState,
} from "./types";
import { createInitialRuntimeState } from "./runtime-state";

export function initializeSimulation(input: SimulationInput): SimulationRuntimeState {
  return createInitialRuntimeState(input);
}

export function resumeSimulation(state: SimulationRuntimeState): SimulationRuntimeState {
  return { ...state, clock: resumeClock(state.clock) };
}

export function pauseSimulation(state: SimulationRuntimeState): SimulationRuntimeState {
  return { ...state, clock: pauseClock(state.clock) };
}

export function setSimulationPlaybackSpeed(
  state: SimulationRuntimeState,
  playbackSpeed: number,
): SimulationRuntimeState {
  return { ...state, clock: setPlaybackSpeed(state.clock, playbackSpeed) };
}

export function stepSimulationToNextEvent(state: SimulationRuntimeState): SimulationRuntimeState {
  const { event, state: withoutEvent } = popNextEvent(state);
  if (!event) {
    return { ...state, clock: completeClock(state.clock) };
  }
  const applied = applySimulationEvent(appendAppliedEvent(withoutEvent, event), event);
  return applied.eventQueue.length === 0 && applied.missions.every((mission) => isTerminalMission(mission))
    ? { ...applied, clock: completeClock(applied.clock) }
    : applied;
}

export function advanceSimulationBy(
  state: SimulationRuntimeState,
  seconds: number,
): SimulationRuntimeState {
  const targetTime = advanceIsoTime(state.clock.currentTime, seconds * state.clock.playbackSpeed);
  let next = state;
  let processed = 0;
  while (
    next.eventQueue[0] &&
    Date.parse(next.eventQueue[0].timestamp) <= Date.parse(targetTime) &&
    processed < next.clock.maxEventsPerAdvance
  ) {
    next = stepSimulationToNextEvent(next);
    processed += 1;
  }
  if (next.clock.status !== "completed" && Date.parse(next.clock.currentTime) < Date.parse(targetTime)) {
    next = { ...next, clock: advanceClockTo(next.clock, targetTime) };
  }
  return next;
}

export function runSimulationToCompletion(input: SimulationInput | SimulationRuntimeState): SimulationRuntimeState {
  let state = "eventQueue" in input ? input : initializeSimulation(input);
  const maxIterations = 10_000;
  for (let index = 0; index < maxIterations && state.clock.status !== "completed"; index += 1) {
    state = stepSimulationToNextEvent(state);
  }
  return state;
}

export function replaySimulation(input: SimulationInput): SimulationRuntimeState {
  return runSimulationToCompletion(initializeSimulation(input));
}

function applySimulationEvent(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  switch (event.type) {
    case "mission_accepted":
      return handleMissionAccepted(state, event);
    case "formation_started":
      return handleFormationStarted(state, event);
    case "consist_join_started":
      return scheduleNext(state, event, "consist_join_completed", state.config.formationSeconds / 2);
    case "consist_join_completed":
      return scheduleNext(state, event, "formation_completed", state.config.formationSeconds / 2);
    case "formation_completed":
      return handleFormationCompleted(state, event);
    case "loading_started":
      return handleLoadingStarted(state, event);
    case "loading_completed":
      return handleLoadingCompleted(state, event);
    case "departure_requested":
      return handleDepartureRequested(state, event);
    case "departure_authorized":
      return handleDepartureAuthorized(state, event);
    case "departure_delayed":
      return handleDepartureDelayed(state, event);
    case "guideway_segment_entered":
      return handleGuidewayEntered(state, event);
    case "guideway_segment_exited":
      return handleGuidewayExited(state, event);
    case "station_arrived":
      return handleStationArrived(state, event);
    case "unloading_started":
      return handleUnloadingStarted(state, event);
    case "unloading_completed":
      return handleUnloadingCompleted(state, event);
    case "charging_started":
      return handleChargingStarted(state, event);
    case "charging_completed":
      return handleChargingCompleted(state, event);
    case "maintenance_started":
      return handleMaintenanceStarted(state, event);
    case "maintenance_completed":
      return handleMaintenanceCompleted(state, event);
    case "consist_split_started":
      return handleConsistSplitStarted(state, event);
    case "consist_split_completed":
      return handleConsistSplitCompleted(state, event);
    case "mission_completed":
      return handleMissionCompleted(state, event);
    case "mission_failed":
      return handleMissionFailed(state, event);
    case "reservation_conflict":
      return markReservationConflict(state, event);
    case "route_blocked":
    case "power_gate_failed":
    case "battery_reserve_violated":
      return requestReplanningAfterFailure(state, event);
    case "fault_raised":
      return handleFaultRaised(state, event);
    case "fault_cleared":
      return handleFaultCleared(state, event);
    case "replanning_requested":
      return handleReplanningRequested(state, event);
  }
}

function handleMissionAccepted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  let next = holdMissionReservations(
    setMissionState(state, event, "queued"),
    mission.plan.id,
    event.timestamp,
  );
  next = activateMissionResourceReservations(
    next,
    mission.plan.id,
    mission.plan.assetIds.map((assetId) => `asset:${assetId}`),
    event.timestamp,
  );
  next = updateMissionAssetsNode(next, mission.plan.id, mission.plan.route.originNodeId);
  next = updateMission(next, mission.plan.id, (current) => ({ ...current, startedAt: event.timestamp }));
  return scheduleNext(next, event, "formation_started", 0);
}

function handleFormationStarted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const acquisition = acquireMissionServiceResources(
    state,
    event,
    mission,
    "formation",
    state.config.formationSeconds,
    serviceResourceIdsForAction(state, mission, "formation"),
  );
  if (!acquisition.acquired) {
    return acquisition.state;
  }
  const next = startMissionConsistFormation(setMissionState(acquisition.state, event, "forming"), mission.plan.id);
  return scheduleNext(next, event, "consist_join_started", 0);
}

function handleFormationCompleted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  if (!event.missionId) {
    return state;
  }
  const released = releaseMissionServiceResources(state, event.missionId, "formation", event.timestamp);
  const next = formMissionConsist(released, event.missionId, event.timestamp);
  return scheduleNext(next, event, "loading_started", 0);
}

function handleLoadingStarted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const chits = missionChits(state, mission.plan);
  const duration = loadingDurationSeconds(state, chits);
  const acquisition = acquireMissionServiceResources(
    state,
    event,
    mission,
    "loading",
    duration,
    serviceResourceIdsForAction(state, mission, "loading"),
  );
  if (!acquisition.acquired) {
    return acquisition.state;
  }
  return scheduleNext(setMissionState(acquisition.state, event, "loading"), event, "loading_completed", duration, {
    loadedQuantity: JSON.stringify(loadedQuantityForChits(chits)),
  });
}

function handleLoadingCompleted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  if (!event.missionId) {
    return state;
  }
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const chits = missionChits(state, mission.plan);
  const quantityByChitId = new Map(chits.map((chit) => [chit.id, quantityForChit(chit)]));
  const released = releaseMissionServiceResources(state, mission.plan.id, "loading", event.timestamp);
  const next = updateMission(setMissionState(released, event, "ready"), mission.plan.id, (current) => ({
    ...current,
    chitProgress: current.chitProgress.map((progress) => ({
      ...progress,
      loaded: quantityByChitId.get(progress.chitId) ?? {},
      status: "loaded",
    })),
  }));
  return scheduleNext(next, event, "departure_requested", 0);
}

function handleDepartureRequested(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const faults = activeFaultsForMission(state, mission.plan.id);
  const blockingFault = faults.find((fault) =>
    !["guideway_segment_blocked", "switch_unavailable"].includes(fault.type) &&
    (fault.behavior === "block" || fault.behavior === "fail" || fault.behavior === "request_replanning")
  );
  if (blockingFault) {
    return scheduleEvent(setMissionState(state, event, "blocked"), {
      timestamp: event.timestamp,
      type: blockingFault.behavior === "fail" ? "mission_failed" : "replanning_requested",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: [blockingFault.targetId],
      causalEventId: event.id,
      payload: { faultId: blockingFault.id, reason: blockingFault.message },
      severity: "error",
    });
  }
  const delayFault = faults.find((fault) => fault.behavior === "delay");
  if (delayFault) {
    return scheduleDelay(state, event, delayFault.message, delayFault.delaySeconds ?? state.config.conflictRetrySeconds);
  }
  if (mission.plan.launchGate.status === "blocked") {
    return scheduleEvent(setMissionState(state, event, "blocked"), {
      timestamp: event.timestamp,
      type: "power_gate_failed",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: mission.plan.launchGate.affectedPowerIds,
      causalEventId: event.id,
      payload: { reason: mission.plan.launchGate.message },
      severity: "error",
    });
  }
  if (mission.plan.launchGate.status === "delayed") {
    return scheduleDelay(state, event, mission.plan.launchGate.message, state.config.conflictRetrySeconds);
  }
  return scheduleNext(setMissionState(state, event, "departing"), event, "departure_authorized", 0);
}

function handleDepartureAuthorized(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  if (mission.plan.route.linkIds.length === 0) {
    return scheduleNext(state, event, "station_arrived", state.config.dwellSeconds);
  }
  return scheduleGuidewayEnter(state, event, mission, 0, event.timestamp);
}

function handleDepartureDelayed(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const retryAt = typeof event.payload.retryAt === "string"
    ? event.payload.retryAt
    : advanceIsoTime(event.timestamp, state.config.conflictRetrySeconds);
  const next = updateMission(setMissionState(state, event, "delayed"), event.missionId ?? "", (mission) => ({
    ...mission,
    delayedUntil: retryAt,
  }));
  return scheduleEvent(next, {
    timestamp: retryAt,
    type: "departure_requested",
    missionId: event.missionId,
    transientWorkerId: event.transientWorkerId,
    affectedAssetIds: event.affectedAssetIds,
    affectedResourceIds: event.affectedResourceIds,
    causalEventId: event.id,
    payload: { retryAfterDelay: true },
  });
}

function handleGuidewayEntered(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  const linkId = typeof event.payload.linkId === "string" ? event.payload.linkId : undefined;
  const routeIndex = typeof event.payload.routeIndex === "number" ? event.payload.routeIndex : 0;
  if (!mission || !linkId) {
    return state;
  }

  const routeFault = activeFaultsForTarget(state, linkId).find((fault) =>
    fault.type === "guideway_segment_blocked" || fault.type === "switch_unavailable"
  );
  if (routeFault) {
    return scheduleEvent(setMissionState(state, event, "blocked"), {
      timestamp: event.timestamp,
      type: "route_blocked",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: [linkId],
      causalEventId: event.id,
      payload: { faultId: routeFault.id, reason: routeFault.message },
      severity: "error",
    });
  }

  const energyWh = linkEnergyWh(state, linkId);
  const energyCheck = missionEnergyCheck(state, mission.plan.id, energyWh);
  if (!energyCheck.ok) {
    return scheduleEvent(setMissionState(state, event, "blocked"), {
      timestamp: event.timestamp,
      type: "battery_reserve_violated",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: [linkId],
      causalEventId: event.id,
      payload: energyCheck,
      severity: "error",
    });
  }

  const travelSeconds = routeLinkTravelSeconds(state, linkId);
  const acquisition = acquireGuidewayOccupancy(state, {
    linkId,
    missionId: mission.plan.id,
    startTime: event.timestamp,
    durationSeconds: travelSeconds,
    assetIds: mission.plan.assetIds,
  });
  if (!acquisition.acquired) {
    const conflict = acquisition.conflict;
    let next = scheduleEvent(setMissionState(state, event, "delayed"), {
      timestamp: event.timestamp,
      type: "reservation_conflict",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: [linkId],
      causalEventId: event.id,
      payload: {
        conflictingMissionId: conflict?.missionId,
        retryAt: acquisition.retryAt,
      },
      severity: "warning",
    });
    next = scheduleEvent(next, {
      timestamp: acquisition.retryAt ?? advanceIsoTime(event.timestamp, state.config.conflictRetrySeconds),
      type: "guideway_segment_entered",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: [linkId],
      causalEventId: event.id,
      payload: { linkId, routeIndex, retryAfterConflict: true },
    });
    return next;
  }

  const link = acquisition.state.scenario.guideway.links.find((candidate) => candidate.id === linkId);
  let next = activateMissionResourceReservations(
    acquisition.state,
    mission.plan.id,
    [`guideway-link:${linkId}`],
    event.timestamp,
  );
  next = updateMission(setMissionState(next, event, "in_transit"), mission.plan.id, (current) => ({
    ...current,
    currentNodeId: link?.fromNodeId ?? current.currentNodeId,
    currentLinkId: linkId,
    routeIndex,
  }));
  next = updateAssets(next, mission.plan.assetIds, (asset) => ({
    ...asset,
    activeMissionId: mission.plan.id,
    nodeId: link?.fromNodeId ?? asset.nodeId,
  }));
  return scheduleEvent(next, {
    timestamp: advanceIsoTime(event.timestamp, travelSeconds),
    type: "guideway_segment_exited",
    missionId: mission.plan.id,
    transientWorkerId: mission.plan.superWorkerId,
    affectedAssetIds: mission.plan.assetIds,
    affectedResourceIds: [linkId],
    causalEventId: event.id,
    payload: { linkId, routeIndex, energyWh },
  });
}

function handleGuidewayExited(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  const linkId = typeof event.payload.linkId === "string" ? event.payload.linkId : undefined;
  const routeIndex = typeof event.payload.routeIndex === "number" ? event.payload.routeIndex : 0;
  if (!mission || !linkId) {
    return state;
  }
  const energyWh = typeof event.payload.energyWh === "number" ? event.payload.energyWh : linkEnergyWh(state, linkId);
  let next = deactivateMissionResourceReservations(
    consumeMissionEnergy(state, mission.plan.id, energyWh),
    mission.plan.id,
    [`guideway-link:${linkId}`],
    event.timestamp,
  );
  next = releaseGuidewayOccupancy(next, linkId, mission.plan.id);
  const link = next.scenario.guideway.links.find((candidate) => candidate.id === linkId);
  const nextNodeId = link?.toNodeId ?? mission.plan.route.pathNodeIds[routeIndex + 1];
  next = updateMission(next, mission.plan.id, (current) => ({
    ...current,
    currentNodeId: nextNodeId,
    currentLinkId: undefined,
  }));
  next = updateMissionAssetsNode(next, mission.plan.id, nextNodeId);

  const nextIndex = routeIndex + 1;
  if (nextIndex >= mission.plan.route.linkIds.length) {
    return scheduleNext(next, event, "station_arrived", state.config.dwellSeconds);
  }
  return scheduleGuidewayEnter(next, event, mission, nextIndex, event.timestamp);
}

function handleStationArrived(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  const located = mission ? updateMissionAssetsNode(state, mission.plan.id, mission.plan.route.destinationNodeId) : state;
  return scheduleNext(setMissionState(located, event, "dwelling"), event, "unloading_started", state.config.dwellSeconds);
}

function handleUnloadingStarted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const chits = missionChits(state, mission.plan);
  const duration = unloadingDurationSeconds(state, chits);
  const resourceIds = serviceResourceIdsForAction(state, mission, "unloading");
  const acquisition = acquireMissionServiceResources(state, event, mission, "unloading", duration, resourceIds);
  if (!acquisition.acquired) {
    return acquisition.state;
  }
  return scheduleNext(setMissionState(acquisition.state, event, "unloading"), event, "unloading_completed", duration, {
    unloadedQuantity: JSON.stringify(unloadedQuantityForChits(chits)),
    resourceIds: JSON.stringify(resourceIds),
  });
}

function handleUnloadingCompleted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const chits = missionChits(state, mission.plan);
  const quantityByChitId = new Map(chits.map((chit) => [chit.id, quantityForChit(chit)]));
  let next = releaseMissionServiceResources(state, mission.plan.id, "unloading", event.timestamp);
  next = updateMission(next, mission.plan.id, (current) => ({
    ...current,
    chitProgress: current.chitProgress.map((progress) => ({
      ...progress,
      unloaded: quantityByChitId.get(progress.chitId) ?? {},
      status: "satisfied",
    })),
  }));
  if (requiresChargingAction(chits, mission.plan.assetIds)) {
    return scheduleNext(next, event, "charging_started", 0);
  }
  if (requiresMaintenanceAction(chits)) {
    return scheduleNext(next, event, "maintenance_started", 0);
  }
  return scheduleNext(next, event, "consist_split_started", 0);
}

function handleChargingStarted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  if (mission.plan.launchGate.status === "blocked") {
    return scheduleEvent(setMissionState(state, event, "blocked"), {
      timestamp: event.timestamp,
      type: "power_gate_failed",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: mission.plan.launchGate.affectedPowerIds,
      causalEventId: event.id,
      payload: { reason: mission.plan.launchGate.message, action: "charging" },
      severity: "error",
    });
  }
  if (mission.plan.launchGate.status === "delayed") {
    return scheduleResourceRetry(
      state,
      event,
      "Charging is delayed by the mission power launch gate.",
      mission.plan.launchGate.affectedPowerIds,
      advanceIsoTime(event.timestamp, state.config.conflictRetrySeconds),
    );
  }
  const resourceIds = serviceResourceIdsForAction(state, mission, "charging");
  const blockingFault = resourceIds
    .flatMap((resourceId) => activeFaultsForTarget(state, resourceId))
    .find((fault) => fault.type === "charger_unavailable" || fault.type === "station_service_unavailable");
  if (blockingFault) {
    if (blockingFault.behavior === "delay") {
      return scheduleResourceRetry(
        state,
        event,
        blockingFault.message,
        [blockingFault.targetId],
        advanceIsoTime(event.timestamp, blockingFault.delaySeconds ?? state.config.conflictRetrySeconds),
      );
    }
    return scheduleEvent(setMissionState(state, event, "blocked"), {
      timestamp: event.timestamp,
      type: blockingFault.behavior === "fail" ? "mission_failed" : "replanning_requested",
      missionId: mission.plan.id,
      transientWorkerId: mission.plan.superWorkerId,
      affectedAssetIds: mission.plan.assetIds,
      affectedResourceIds: [blockingFault.targetId],
      causalEventId: event.id,
      payload: { faultId: blockingFault.id, reason: blockingFault.message },
      severity: "error",
    });
  }
  const duration = Math.ceil((state.config.minimumBatteryReserveWh * 3600) / state.config.chargingPowerWatts);
  const acquisition = acquireMissionServiceResources(state, event, mission, "charging", duration, resourceIds);
  if (!acquisition.acquired) {
    return acquisition.state;
  }
  const powerResourceIds = missionReservedResourceIds(acquisition.state, mission.plan.id, "power-window");
  const powered = activateMissionResourceReservations(acquisition.state, mission.plan.id, powerResourceIds, event.timestamp);
  return scheduleNext(setMissionState(powered, event, "servicing"), event, "charging_completed", duration, {
    chargingPowerWatts: state.config.chargingPowerWatts,
    durationSeconds: duration,
    resourceIds: JSON.stringify(resourceIds),
  });
}

function handleChargingCompleted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const durationSeconds = typeof event.payload.durationSeconds === "number"
    ? event.payload.durationSeconds
    : Math.ceil((state.config.minimumBatteryReserveWh * 3600) / state.config.chargingPowerWatts);
  let next = chargeMissionAssets(state, mission.plan.id, durationSeconds);
  next = releaseMissionServiceResources(next, mission.plan.id, "charging", event.timestamp);
  next = deactivateMissionResourceReservations(
    next,
    mission.plan.id,
    missionReservedResourceIds(next, mission.plan.id, "power-window"),
    event.timestamp,
  );
  const chits = missionChits(next, mission.plan);
  if (requiresMaintenanceAction(chits)) {
    return scheduleNext(next, event, "maintenance_started", 0);
  }
  return scheduleNext(next, event, "consist_split_started", 0);
}

function handleMaintenanceStarted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const mission = findMission(state, event.missionId);
  if (!mission) {
    return state;
  }
  const duration = state.config.maintenanceSeconds;
  const acquisition = acquireMissionServiceResources(
    state,
    event,
    mission,
    "maintenance",
    duration,
    serviceResourceIdsForAction(state, mission, "maintenance"),
  );
  if (!acquisition.acquired) {
    return acquisition.state;
  }
  return scheduleNext(setMissionState(acquisition.state, event, "servicing"), event, "maintenance_completed", duration);
}

function handleMaintenanceCompleted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  if (!event.missionId) {
    return state;
  }
  const next = releaseMissionServiceResources(state, event.missionId, "maintenance", event.timestamp);
  return scheduleNext(next, event, "consist_split_started", 0);
}

function handleConsistSplitStarted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const missionId = event.missionId ?? "";
  const mission = findMission(state, missionId);
  if (!mission) {
    return state;
  }
  const acquisition = acquireMissionServiceResources(
    state,
    event,
    mission,
    "split",
    state.config.splitSeconds,
    serviceResourceIdsForAction(state, mission, "split"),
  );
  if (!acquisition.acquired) {
    return acquisition.state;
  }
  return scheduleNext(
    startMissionConsistSplit(setMissionState(acquisition.state, event, "servicing"), missionId),
    event,
    "consist_split_completed",
    state.config.splitSeconds,
  );
}

function handleConsistSplitCompleted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  if (!event.missionId) {
    return state;
  }
  const released = releaseMissionServiceResources(state, event.missionId, "split", event.timestamp);
  const next = dissolveMissionConsist(released, event.missionId, event.timestamp);
  return scheduleNext(next, event, "mission_completed", 0);
}

function handleMissionCompleted(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  if (!event.missionId) {
    return state;
  }
  let next = releaseMissionReservations(setMissionState(state, event, "completed"), event.missionId, event.timestamp);
  next = updateMission(next, event.missionId, (mission) => ({ ...mission, completedAt: event.timestamp }));
  return updateAssets(next, findMission(next, event.missionId)?.plan.assetIds ?? [], (asset) => ({
    ...asset,
    activeMissionId: undefined,
    consistId: undefined,
  }));
}

function handleMissionFailed(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  if (!event.missionId) {
    return state;
  }
  const failed = releaseMissionReservations(setMissionState(state, event, "failed"), event.missionId, event.timestamp);
  return updateMission(failed, event.missionId, (mission) => ({
    ...mission,
    completedAt: event.timestamp,
    chitProgress: mission.chitProgress.map((progress) => ({ ...progress, status: "failed" })),
  }));
}

function handleFaultRaised(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const fault = scheduledFaultById(state, typeof event.payload.faultId === "string" ? event.payload.faultId : undefined);
  if (!fault) {
    return state;
  }
  let next = raiseFault(state, fault, event.id);
  const affectedMission = next.missions.find((mission) =>
    mission.plan.assetIds.includes(fault.targetId) ||
    mission.plan.route.linkIds.includes(fault.targetId) ||
    mission.plan.reservationIds.includes(fault.targetId)
  );
  if (!affectedMission) {
    return next;
  }
  if (fault.behavior === "fail") {
    next = scheduleEvent(next, {
      timestamp: event.timestamp,
      type: "mission_failed",
      missionId: affectedMission.plan.id,
      transientWorkerId: affectedMission.plan.superWorkerId,
      affectedAssetIds: affectedMission.plan.assetIds,
      affectedResourceIds: [fault.targetId],
      causalEventId: event.id,
      payload: { faultId: fault.id, reason: fault.message },
      severity: "error",
    });
  }
  if (fault.behavior === "request_replanning") {
    next = scheduleEvent(next, {
      timestamp: event.timestamp,
      type: "replanning_requested",
      missionId: affectedMission.plan.id,
      transientWorkerId: affectedMission.plan.superWorkerId,
      affectedAssetIds: affectedMission.plan.assetIds,
      affectedResourceIds: [fault.targetId],
      causalEventId: event.id,
      payload: { faultId: fault.id, reason: fault.message },
      severity: "warning",
    });
  }
  return next;
}

function handleFaultCleared(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  return clearFault(state, typeof event.payload.faultId === "string" ? event.payload.faultId : "");
}

function handleReplanningRequested(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const request = createReplanningRequest(
    state,
    event,
    typeof event.payload.reason === "string" ? event.payload.reason : "Execution diverged from the committed plan.",
  );
  return {
    ...setMissionState(state, event, "blocked"),
    replanningRequests: [...state.replanningRequests, request].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function requestReplanningAfterFailure(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const next = scheduleEvent(state, {
    timestamp: event.timestamp,
    type: "replanning_requested",
    missionId: event.missionId,
    transientWorkerId: event.transientWorkerId,
    affectedAssetIds: event.affectedAssetIds,
    affectedResourceIds: event.affectedResourceIds,
    causalEventId: event.id,
    payload: { reason: event.payload.reason ?? event.type },
    severity: event.severity,
  });
  return event.type === "battery_reserve_violated" || event.type === "route_blocked" || event.type === "power_gate_failed"
    ? setMissionState(next, event, "blocked")
    : next;
}

type MissionServiceAction = ServiceOccupancy["action"];

function acquireMissionServiceResources(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  mission: RuntimeMission,
  action: MissionServiceAction,
  durationSeconds: number,
  resourceIds: readonly string[],
): { acquired: true; state: SimulationRuntimeState } | { acquired: false; state: SimulationRuntimeState } {
  const resources = uniqueSorted(resourceIds);
  if (resources.length === 0) {
    return { acquired: true, state };
  }

  let next = state;
  const acquiredResources: string[] = [];
  for (const resourceId of resources) {
    const reservation = missionReservationCoversStart(next, mission.plan.id, resourceId, event.timestamp);
    if (!reservation.available) {
      const rolledBack = releaseMissionServiceResources(next, mission.plan.id, action, event.timestamp);
      return {
        acquired: false,
        state: scheduleResourceRetry(rolledBack, event, reservation.reason, [resourceId], reservation.retryAt),
      };
    }

    next = activateMissionResourceReservations(next, mission.plan.id, [resourceId], event.timestamp);
    const acquisition = acquireServiceOccupancy(next, {
      resourceId,
      missionId: mission.plan.id,
      action,
      startTime: event.timestamp,
      durationSeconds,
    });
    if (!acquisition.acquired) {
      let rolledBack = releaseServiceOccupancy(acquisition.state, mission.plan.id, action);
      rolledBack = deactivateMissionResourceReservations(
        rolledBack,
        mission.plan.id,
        [...acquiredResources, resourceId],
        event.timestamp,
      );
      return {
        acquired: false,
        state: scheduleResourceRetry(
          rolledBack,
          event,
          `${resourceId} is occupied by ${acquisition.conflict?.missionId ?? "another mission"}.`,
          [resourceId],
          acquisition.retryAt,
        ),
      };
    }

    next = acquisition.state;
    acquiredResources.push(resourceId);
  }

  return { acquired: true, state: next };
}

function releaseMissionServiceResources(
  state: SimulationRuntimeState,
  missionId: string,
  action: MissionServiceAction,
  timestamp: string,
): SimulationRuntimeState {
  const occupiedResources = state.serviceOccupancy
    .filter((occupancy) => occupancy.missionId === missionId && occupancy.action === action)
    .map((occupancy) => occupancy.resourceId);
  const deactivated = deactivateMissionResourceReservations(state, missionId, occupiedResources, timestamp);
  return releaseServiceOccupancy(deactivated, missionId, action);
}

function serviceResourceIdsForAction(
  state: SimulationRuntimeState,
  mission: RuntimeMission,
  action: MissionServiceAction,
): string[] {
  const chits = missionChits(state, mission.plan);
  const stationReservations = missionReservedResourceIds(state, mission.plan.id, "station-zone");

  if (action === "loading") {
    return endpointServiceResources(chits, "origin", stationReservations);
  }
  if (action === "unloading") {
    return endpointServiceResources(chits, "destination", stationReservations);
  }
  if (action === "charging") {
    const chargingResources = stationReservations.filter((resourceId) =>
      serviceZoneType(state, resourceId) === "charging-siding"
    );
    return chargingResources.length > 0
      ? chargingResources
      : endpointServiceResources(chits, "destination", stationReservations);
  }
  if (action === "maintenance") {
    const maintenanceResources = stationReservations.filter((resourceId) =>
      serviceZoneType(state, resourceId) === "maintenance"
    );
    return maintenanceResources.length > 0 ? maintenanceResources : stationReservations;
  }
  if (action === "split") {
    return endpointServiceResources(chits, "destination", stationReservations);
  }
  return stationReservations.length > 0 ? stationReservations : missionServiceZoneResourceIds(mission.plan);
}

function endpointServiceResources(
  chits: ReturnType<typeof missionChits>,
  endpoint: "origin" | "destination",
  allowedResources: readonly string[],
): string[] {
  const allowed = new Set(allowedResources);
  const resources = uniqueSorted(chits
    .map((chit) => chit[endpoint].serviceZoneId ? `station-zone:${chit[endpoint].serviceZoneId}` : undefined)
    .filter((resourceId): resourceId is string => Boolean(resourceId))
    .filter((resourceId) => allowed.size === 0 || allowed.has(resourceId)));
  return resources.length > 0 ? resources : uniqueSorted(allowedResources);
}

function serviceZoneType(state: SimulationRuntimeState, resourceId: string): string | undefined {
  const zoneId = resourceId.replace(/^station-zone:/, "");
  return state.scenario.serviceZones.find((zone) => zone.id === zoneId)?.type;
}

function scheduleResourceRetry(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  reason: string,
  resourceIds: readonly string[],
  retryAt = advanceIsoTime(event.timestamp, state.config.conflictRetrySeconds),
): SimulationRuntimeState {
  let next = scheduleEvent(setMissionState(state, event, "delayed"), {
    timestamp: event.timestamp,
    type: "reservation_conflict",
    missionId: event.missionId,
    transientWorkerId: event.transientWorkerId,
    affectedAssetIds: event.affectedAssetIds,
    affectedResourceIds: resourceIds,
    causalEventId: event.id,
    payload: { reason, retryAt, retryEventType: event.type },
    severity: "warning",
  });
  next = scheduleEvent(next, {
    timestamp: retryAt,
    type: event.type,
    missionId: event.missionId,
    workerId: event.workerId,
    transientWorkerId: event.transientWorkerId,
    affectedAssetIds: event.affectedAssetIds,
    affectedResourceIds: resourceIds,
    causalEventId: event.id,
    payload: { ...event.payload, retryAfterConflict: true },
    severity: event.severity,
  });
  return next;
}

function updateMissionAssetsNode(
  state: SimulationRuntimeState,
  missionId: string,
  nodeId: string | undefined,
): SimulationRuntimeState {
  const mission = findMission(state, missionId);
  if (!mission || !nodeId) {
    return state;
  }
  return updateAssets(state, mission.plan.assetIds, (asset) => ({ ...asset, nodeId }));
}

function scheduleGuidewayEnter(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  mission: RuntimeMission,
  routeIndex: number,
  timestamp: string,
): SimulationRuntimeState {
  const linkId = mission.plan.route.linkIds[routeIndex];
  return scheduleEvent(state, {
    timestamp,
    type: "guideway_segment_entered",
    missionId: mission.plan.id,
    transientWorkerId: mission.plan.superWorkerId,
    affectedAssetIds: mission.plan.assetIds,
    affectedResourceIds: [linkId],
    causalEventId: event.id,
    payload: { linkId, routeIndex },
  });
}

function scheduleNext(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  type: SimulationEvent["type"],
  delaySeconds: number,
  payload: SimulationEvent["payload"] = {},
): SimulationRuntimeState {
  return scheduleEvent(state, {
    timestamp: advanceIsoTime(event.timestamp, delaySeconds),
    type,
    missionId: event.missionId,
    workerId: event.workerId,
    transientWorkerId: event.transientWorkerId,
    affectedAssetIds: event.affectedAssetIds,
    affectedResourceIds: event.affectedResourceIds,
    causalEventId: event.id,
    payload,
  });
}

function scheduleDelay(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  reason: string,
  delaySeconds: number,
): SimulationRuntimeState {
  const retryAt = advanceIsoTime(event.timestamp, delaySeconds);
  return scheduleEvent(setMissionState(state, event, "delayed"), {
    timestamp: event.timestamp,
    type: "departure_delayed",
    missionId: event.missionId,
    transientWorkerId: event.transientWorkerId,
    affectedAssetIds: event.affectedAssetIds,
    affectedResourceIds: event.affectedResourceIds,
    causalEventId: event.id,
    payload: { reason, retryAt },
    severity: "warning",
  });
}

function setMissionState(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  lifecycleState: RuntimeMission["state"],
): SimulationRuntimeState {
  if (!event.missionId) {
    return state;
  }
  let rejected: { from: RuntimeMission["state"]; to: RuntimeMission["state"] } | undefined;
  const updated = updateMission(state, event.missionId, (mission) => {
    const transition = transitionMissionLifecycleState(mission, lifecycleState, event.id);
    if (!transition.accepted) {
      rejected = { from: transition.from, to: transition.to };
    }
    return transition.mission;
  });
  return rejected ? annotateRejectedLifecycleTransition(updated, event, rejected.from, rejected.to) : updated;
}

function annotateRejectedLifecycleTransition(
  state: SimulationRuntimeState,
  event: SimulationEvent,
  from: RuntimeMission["state"],
  to: RuntimeMission["state"],
): SimulationRuntimeState {
  return {
    ...state,
    eventHistory: state.eventHistory.map((appliedEvent) =>
      appliedEvent.id === event.id
        ? {
            ...appliedEvent,
            status: "skipped",
            severity: "error",
            payload: {
              ...appliedEvent.payload,
              rejectedTransition: `${from}->${to}`,
              reason: `Mission lifecycle transition ${from}->${to} is not allowed.`,
            },
          }
        : appliedEvent
    ),
  };
}

function markReservationConflict(
  state: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const affectedResources = new Set(event.affectedResourceIds);
  return {
    ...state,
    reservations: state.reservations.map((reservation) =>
      reservation.reservation.missionPlanId === event.missionId &&
        (affectedResources.size === 0 || affectedResources.has(reservation.reservation.resourceId))
        ? {
            ...reservation,
            status: "conflict",
            conflictEventIds: [...new Set([...reservation.conflictEventIds, event.id])].sort(),
          }
        : reservation
    ),
  };
}

function isTerminalMission(mission: RuntimeMission): boolean {
  return ["completed", "failed", "cancelled", "blocked"].includes(mission.state);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
