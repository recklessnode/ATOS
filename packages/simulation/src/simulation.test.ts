import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  advanceSimulationBy,
  canTransitionMissionState,
  createSimulationEvent,
  createSimulationFixture,
  filterSimulationEvents,
  initializeSimulation,
  orderedEventQueue,
  parseEventLog,
  pauseSimulation,
  replaySimulation,
  resumeSimulation,
  runSimulationToCompletion,
  serializeEventLog,
  setSimulationPlaybackSpeed,
  stepSimulationToNextEvent,
  type SimulationEventType,
  type SimulationRuntimeState,
} from ".";

describe("ATOS simulation engine", () => {
  it("orders equal-time events deterministically by type, mission, resource, and sequence", () => {
    const timestamp = "2026-07-10T00:00:00.000Z";
    const events = orderedEventQueue([
      createSimulationEvent({
        timestamp,
        type: "guideway_segment_entered",
        missionId: "mission:b",
        affectedResourceIds: ["guideway-link:z"],
      }, 3),
      createSimulationEvent({
        timestamp,
        type: "mission_accepted",
        missionId: "mission:a",
      }, 2),
      createSimulationEvent({
        timestamp,
        type: "fault_raised",
        affectedResourceIds: ["guideway-link:a"],
      }, 1),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "fault_raised",
      "mission_accepted",
      "guideway_segment_entered",
    ]);
  });

  it("supports pause, resume, playback speed, step, and fixed interval advance without wall-clock dependence", () => {
    const state = initializeSimulation(createSimulationFixture("simple-passenger"));
    const running = resumeSimulation(state);
    const sped = setSimulationPlaybackSpeed(running, 2);
    const stepped = stepSimulationToNextEvent(sped);
    const paused = pauseSimulation(stepped);
    const advanced = advanceSimulationBy(resumeSimulation(paused), 60);

    expect(running.clock.status).toBe("running");
    expect(paused.clock.status).toBe("paused");
    expect(stepped.clock.processedEventCount).toBe(1);
    expect(advanced.clock.currentTime).not.toBe(paused.clock.currentTime);
    expect(advanced.clock.playbackSpeed).toBe(2);
  });

  it("executes mission lifecycle transitions through explicit events", () => {
    const result = runSimulationToCompletion(createSimulationFixture("simple-passenger"));
    const mission = result.missions[0];

    expect(mission?.state).toBe("completed");
    expect(result.eventHistory.map((event) => event.type)).toEqual(expect.arrayContaining([
      "mission_accepted",
      "formation_started",
      "consist_join_started",
      "consist_join_completed",
      "formation_completed",
      "loading_started",
      "loading_completed",
      "departure_requested",
      "departure_authorized",
      "station_arrived",
      "unloading_started",
      "unloading_completed",
      "consist_split_started",
      "consist_split_completed",
      "mission_completed",
    ]));
  });

  it("rejects lifecycle transitions outside the explicit mission graph", () => {
    expect(canTransitionMissionState("planned", "queued")).toBe(true);
    expect(canTransitionMissionState("loading", "ready")).toBe(true);
    expect(canTransitionMissionState("completed", "loading")).toBe(false);
    expect(canTransitionMissionState("blocked", "in_transit")).toBe(false);
  });

  it("acquires and releases guideway occupancy for traversed links", () => {
    const result = runSimulationToCompletion(createSimulationFixture("consist-formation-split"));
    const entered = result.eventHistory.filter((event) => event.type === "guideway_segment_entered");
    const exited = result.eventHistory.filter((event) => event.type === "guideway_segment_exited");

    expect(entered.length).toBeGreaterThan(0);
    expect(exited).toHaveLength(entered.length);
    expect(result.guidewayOccupancy).toHaveLength(0);
  });

  it("activates service reservations only while service actions execute", () => {
    let state = initializeSimulation(createSimulationFixture("consist-formation-split"));
    state = stepUntilEvent(state, "loading_started");

    const loadingResources = state.serviceOccupancy
      .filter((occupancy) => occupancy.action === "loading")
      .map((occupancy) => occupancy.resourceId);
    expect(loadingResources.length).toBeGreaterThan(0);
    expect(state.reservations.filter((reservation) =>
      loadingResources.includes(reservation.reservation.resourceId)
    ).map((reservation) => reservation.status)).toEqual(loadingResources.map(() => "active"));

    state = stepUntilEvent(state, "loading_completed");
    expect(state.serviceOccupancy.filter((occupancy) => occupancy.action === "loading")).toHaveLength(0);
    expect(state.reservations.filter((reservation) =>
      loadingResources.includes(reservation.reservation.resourceId)
    ).every((reservation) => reservation.status === "held")).toBe(true);

    state = stepUntilEvent(state, "unloading_started");
    expect(state.serviceOccupancy.some((occupancy) => occupancy.action === "unloading")).toBe(true);
  });

  it("delays conflicting reservations and resolves the conflict deterministically", () => {
    const first = runSimulationToCompletion(createSimulationFixture("conflicting-deterministic"));
    const second = runSimulationToCompletion(createSimulationFixture("conflicting-deterministic"));
    const conflicts = first.eventHistory.filter((event) => event.type === "reservation_conflict");

    expect(conflicts.length).toBeGreaterThan(0);
    expect(first.missions.map((mission) => mission.state)).toEqual(["completed", "completed"]);
    expect(first.eventHistory.map(eventSignature)).toEqual(second.eventHistory.map(eventSignature));
  });

  it("advances mission member asset locations with the traversed guideway segment", () => {
    let state = initializeSimulation(createSimulationFixture("consist-formation-split"));
    state = stepUntilEvent(state, "guideway_segment_entered");
    const entered = state.eventHistory.find((event) => event.type === "guideway_segment_entered");
    const link = state.scenario.guideway.links.find((candidate) => candidate.id === entered?.payload.linkId);
    const mission = state.missions[0];

    expect(link).toBeDefined();
    expect(mission?.currentNodeId).toBe(link?.fromNodeId);
    expect(state.assets.filter((asset) => mission?.plan.assetIds.includes(asset.assetId)).every((asset) =>
      asset.nodeId === link?.fromNodeId
    )).toBe(true);

    state = stepUntilEvent(state, "guideway_segment_exited");
    expect(state.assets.filter((asset) => mission?.plan.assetIds.includes(asset.assetId)).every((asset) =>
      asset.nodeId === link?.toNodeId
    )).toBe(true);
  });

  it("derives deterministic station dwell, loading, and unloading quantities", () => {
    const result = runSimulationToCompletion(createSimulationFixture("cargo-crane"));
    const arrived = result.eventHistory.find((event) => event.type === "station_arrived");
    const unloading = result.eventHistory.find((event) => event.type === "unloading_started");
    const loadingCompleted = result.eventHistory.find((event) => event.type === "loading_completed");
    const unloadingCompleted = result.eventHistory.find((event) => event.type === "unloading_completed");

    expect(arrived).toBeDefined();
    expect(unloading).toBeDefined();
    expect(Date.parse(unloading?.timestamp ?? "") - Date.parse(arrived?.timestamp ?? "")).toBe(
      result.config.dwellSeconds * 1000,
    );
    expect(String(loadingCompleted?.payload.loadedQuantity)).toContain("massKg");
    expect(String(unloadingCompleted?.payload.unloadedQuantity)).toContain("massKg");
  });

  it("records grouped chit fulfillment with each chit quantity rather than the aggregate manifest", () => {
    const result = runSimulationToCompletion(createSimulationFixture("consist-formation-split"));
    const mission = result.missions[0];
    const commuter = mission?.chitProgress.find((progress) => progress.chitId === "chit-commuter");
    const cargo = mission?.chitProgress.find((progress) => progress.chitId === "chit-cargo");

    expect(commuter?.loaded).toMatchObject({ passengers: 6 });
    expect(commuter?.loaded.massKg).toBeUndefined();
    expect(cargo?.loaded).toMatchObject({ massKg: 8, volumeLiters: 40 });
    expect(cargo?.loaded.passengers).toBeUndefined();
    expect(commuter?.unloaded).toEqual(commuter?.loaded);
    expect(cargo?.unloaded).toEqual(cargo?.loaded);
  });

  it("forms and dissolves software-defined consists while preserving member identities", () => {
    const result = runSimulationToCompletion(createSimulationFixture("consist-formation-split"));
    const consist = result.consists[0];

    expect(consist?.status).toBe("dissolved");
    expect(consist?.memberAssetIds.length).toBeGreaterThan(1);
    expect(result.eventHistory.map((event) => event.type)).toEqual(expect.arrayContaining([
      "consist_join_completed",
      "consist_split_completed",
    ]));
    expect(result.assets.filter((asset) => consist?.memberAssetIds.includes(asset.assetId)).every((asset) =>
      !asset.activeMissionId && !asset.consistId
    )).toBe(true);
  });

  it("tracks charging actions and battery state of charge updates", () => {
    const input = createSimulationFixture("battery-support");
    const before = input.dispatchResult.assets
      .filter((asset) => input.dispatchResult.missionPlans[0]?.assetIds.includes(asset.id))
      .map((asset) => asset.battery?.stateOfChargeWh ?? 0);
    const result = runSimulationToCompletion(input);
    const after = result.assets
      .filter((asset) => result.missions[0]?.plan.assetIds.includes(asset.assetId))
      .map((asset) => asset.battery?.stateOfChargeWh ?? 0);

    expect(result.eventHistory.some((event) => event.type === "charging_started")).toBe(true);
    expect(Math.max(...after)).toBeGreaterThanOrEqual(Math.max(...before) - result.missions[0]!.energyConsumedWh);
    expect(result.assets.every((asset) =>
      !asset.battery || asset.battery.stateOfChargeWh <= asset.battery.usableCapacityWh
    )).toBe(true);
  });

  it("requires charging service and power reservations before applying charge", () => {
    let state = initializeSimulation(createSimulationFixture("battery-support"));
    state = stepUntilEvent(state, "charging_started");
    const mission = state.missions[0];
    const chargingOccupancy = state.serviceOccupancy.find((occupancy) => occupancy.action === "charging");
    const powerReservation = state.reservations.find((reservation) =>
      reservation.reservation.missionPlanId === mission?.plan.id &&
      reservation.reservation.resourceType === "power-window"
    );

    expect(chargingOccupancy).toBeDefined();
    expect(powerReservation?.status).toBe("active");

    state = stepUntilEvent(state, "charging_completed");
    expect(state.serviceOccupancy.some((occupancy) => occupancy.action === "charging")).toBe(false);
    expect(state.reservations.find((reservation) =>
      reservation.reservation.id === powerReservation?.reservation.id
    )?.status).toBe("held");
  });

  it("emits battery reserve violations instead of silently overdrawing energy", () => {
    const result = runSimulationToCompletion({
      ...createSimulationFixture("consist-formation-split"),
      config: { minimumBatteryReserveWh: 10_000 },
    });

    expect(result.eventHistory.some((event) => event.type === "battery_reserve_violated")).toBe(true);
    expect(result.replanningRequests.length).toBeGreaterThan(0);
    expect(result.missions[0]?.state).toBe("blocked");
  });

  it("raises faults and generates structured replanning requests across the dispatch boundary", () => {
    const result = runSimulationToCompletion(createSimulationFixture("asset-fault-replanning"));

    expect(result.eventHistory.map((event) => event.type)).toEqual(expect.arrayContaining([
      "fault_raised",
      "replanning_requested",
    ]));
    expect(result.replanningRequests[0]).toMatchObject({
      status: "requested",
    });
    expect(result.replanningRequests[0]?.assetStates.length).toBeGreaterThan(0);
  });

  it("runs concurrent non-conflicting fixture missions without reservation conflicts", () => {
    const result = runSimulationToCompletion(createSimulationFixture("concurrent-non-conflicting"));

    expect(result.missions.length).toBe(2);
    expect(result.missions.every((mission) => mission.state === "completed")).toBe(true);
    expect(result.eventHistory.some((event) => event.type === "reservation_conflict")).toBe(false);
  });

  it("blocks route faults and emits replanning without hidden dispatch logic", () => {
    const result = runSimulationToCompletion(createSimulationFixture("blocked-route"));

    expect(result.eventHistory.map((event) => event.type)).toEqual(expect.arrayContaining([
      "fault_raised",
      "route_blocked",
      "replanning_requested",
    ]));
    expect(result.dispatchResult.missionPlans.length).toBe(1);
    expect(result.replanningRequests[0]?.retainedReservationIds.length).toBeGreaterThan(0);
  });

  it("serializes event logs and filters observability output by mission, type, severity, resource, and causal chain", () => {
    const result = runSimulationToCompletion(createSimulationFixture("consist-formation-split"));
    const serialized = serializeEventLog(result.eventHistory);
    const parsed = parseEventLog(serialized);
    const missionId = result.missions[0]?.plan.id;
    const entered = result.eventHistory.find((event) => event.type === "guideway_segment_entered");

    expect(parsed).toEqual(result.eventHistory);
    expect(filterSimulationEvents(result.eventHistory, { missionId })).toHaveLength(result.eventHistory.length);
    expect(filterSimulationEvents(result.eventHistory, { eventType: "guideway_segment_entered" })).toHaveLength(
      result.eventHistory.filter((event) => event.type === "guideway_segment_entered").length,
    );
    expect(filterSimulationEvents(result.eventHistory, { severity: "error" })).toHaveLength(0);
    expect(filterSimulationEvents(result.eventHistory, { resourceId: entered?.affectedResourceIds[0] })).toContainEqual(entered);
    expect(filterSimulationEvents(result.eventHistory, { causalEventId: entered?.causalEventId })).not.toHaveLength(0);
  });

  it("replays identical inputs with identical outputs and keeps planning documents immutable", () => {
    const input = createSimulationFixture("simple-passenger");
    const beforeScenario = JSON.stringify(input.scenario);
    const beforeDispatch = JSON.stringify(input.dispatchResult);
    const first = replaySimulation(input);
    const second = replaySimulation(input);

    expect(first.eventHistory.map(eventSignature)).toEqual(second.eventHistory.map(eventSignature));
    expect(JSON.stringify(input.scenario)).toBe(beforeScenario);
    expect(JSON.stringify(input.dispatchResult)).toBe(beforeDispatch);
  });

  it("keeps the simulation package React-free", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const source = sourceFiles(join(process.cwd(), "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(packageJson.dependencies?.react).toBeUndefined();
    expect(packageJson.devDependencies?.react).toBeUndefined();
    expect(source).not.toMatch(/from\s+["']react["']/);
  });
});

function eventSignature(event: { timestamp: string; type: string; missionId?: string; affectedResourceIds: readonly string[] }) {
  return `${event.timestamp}|${event.type}|${event.missionId ?? ""}|${event.affectedResourceIds.join(",")}`;
}

function stepUntilEvent(
  state: SimulationRuntimeState,
  type: SimulationEventType,
): SimulationRuntimeState {
  let next = state;
  for (let index = 0; index < 500; index += 1) {
    next = stepSimulationToNextEvent(next);
    if (next.eventHistory.at(-1)?.type === type) {
      return next;
    }
  }
  throw new Error(`Event ${type} was not reached.`);
}

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry);
    return statSync(fullPath).isDirectory() ? sourceFiles(fullPath) : [fullPath];
  });
}
