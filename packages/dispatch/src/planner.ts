import type { StableId } from "@atos/domain";
import { analyzePowerNetwork, applyPowerPreset, type PowerAnalysisResult, type PowerNetworkInput } from "@atos/power";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import { assetById, buildDispatchAssets, buildDispatchWorkers, supportWorkersForServiceZones } from "./assets";
import { normalizeDispatchChits, requiredCapabilitiesForKind, requiredVehicleClassesForKind } from "./normalization";
import { evaluatePowerLaunchGate } from "./power-gate";
import { routeBetweenEndpoints } from "./route";
import type {
  CapabilityMatch,
  DeficiencyGate,
  DispatchAsset,
  DispatchCandidate,
  DispatchChit,
  DispatchChitGroup,
  DispatchPlannerInput,
  DispatchPlannerOptions,
  DispatchPlannerResult,
  DispatchReservation,
  DispatchScoreBreakdown,
  DispatchWorker,
  GuidewayRoute,
  InfrastructureRecommendation,
  MissionPlan,
  MissionPlanStep,
  PowerLaunchGate,
  TransientSuperWorker,
} from "./types";

type CandidateEvaluation = DispatchCandidate & {
  group: DispatchChitGroup;
  primaryWorker: DispatchWorker;
  primaryWorkers: DispatchWorker[];
  supportWorkers: DispatchWorker[];
};

type NormalizedRuntimeConstraints = {
  allowedChitIds: ReadonlySet<StableId>;
  retainedReservations: DispatchReservation[];
  unavailableResourceIds: ReadonlySet<StableId>;
  unavailableAssetIds: ReadonlySet<StableId>;
  powerConstraintIds: StableId[];
};

export function createDispatchPlannerInput(
  scenario: ScenarioDocumentV1,
  options: DispatchPlannerOptions = {},
): DispatchPlannerInput {
  const electrical = electricalInputFromScenario(scenario);
  const preset = options.powerPreset ?? "normal_operations";
  return {
    scenario,
    guideway: {
      nodes: scenario.guideway.nodes,
      links: scenario.guideway.links,
      serviceAttachments: scenario.guideway.serviceAttachments,
    },
    electrical,
    powerAnalysis: analyzePowerNetwork(applyPowerPreset(electrical, preset)),
    options,
  };
}

function normalizeRuntimeConstraints(
  constraints: DispatchPlannerOptions["runtimeConstraints"] | undefined,
): NormalizedRuntimeConstraints {
  const unavailableResourceIds = new Set(constraints?.unavailableResourceIds ?? []);
  const unavailableAssetIds = new Set(constraints?.unavailableAssetIds ?? []);
  return {
    allowedChitIds: new Set(constraints?.allowedChitIds ?? []),
    retainedReservations: [...(constraints?.retainedReservations ?? [])]
      .map((reservation) => ({ ...reservation }))
      .sort(compareById),
    unavailableResourceIds,
    unavailableAssetIds,
    powerConstraintIds: [...new Set(constraints?.powerConstraintIds ?? [])].sort(),
  };
}

export function planDispatch(input: DispatchPlannerInput): DispatchPlannerResult {
  const scenario = input.scenario;
  const generatedAt = input.options?.currentTime ?? scenario.simulation.currentTime;
  const powerAnalysis = input.powerAnalysis ?? analyzePowerNetwork(input.electrical);
  const runtimeConstraints = normalizeRuntimeConstraints(input.options?.runtimeConstraints);
  const normalizedChits = [
    ...normalizeDispatchChits(scenario.chits, generatedAt),
    ...(input.options?.generatedChits ?? []),
  ].filter((chit) =>
    runtimeConstraints.allowedChitIds.size === 0 || runtimeConstraints.allowedChitIds.has(chit.id)
  ).sort((left, right) => {
    const scoreCompare = right.rankScore - left.rankScore;
    return scoreCompare === 0 ? left.id.localeCompare(right.id) : scoreCompare;
  });
  const assets = applyRuntimeAssetConstraints(buildDispatchAssets(scenario), runtimeConstraints);
  const workers = buildDispatchWorkers(assets);
  const powerGate = applyRuntimePowerConstraints(evaluatePowerLaunchGate(powerAnalysis, assets), runtimeConstraints);
  const assetIndex = assetById(assets);
  const vehicleWorkers = workers.filter((worker) => worker.source === "vehicle").sort(compareById);
  const resourceCapacity = reservationCapacityIndex(scenario);
  const pendingGroups = groupDispatchChits(normalizedChits);

  const allCandidates: DispatchCandidate[] = [];
  const transientSuperWorkers: TransientSuperWorker[] = [];
  const reservations: DispatchReservation[] = runtimeConstraints.retainedReservations.map((reservation) => ({ ...reservation }));
  const missionPlans: MissionPlan[] = [];
  const deficiencyGates: DeficiencyGate[] = [];

  for (let groupIndex = 0; groupIndex < pendingGroups.length; groupIndex += 1) {
    const group = pendingGroups[groupIndex];
    const evaluations = vehicleWorkers
      .map((worker) => evaluateCandidate({
        group,
        primaryWorker: worker,
        vehicleWorkers,
        workers,
        assets,
        powerGate,
        input,
        runtimeConstraints,
      }))
      .sort(compareCandidateEvaluations);

    allCandidates.push(...evaluations.map(stripCandidateRuntime));
    const eligible = evaluations.filter((candidate) => candidate.match.eligible && candidate.route.reachable);
    const launchable = eligible.filter((candidate) => candidate.launchGate.status !== "blocked");
    const window = planningWindowForGroup(group, generatedAt, launchable[0]?.route);
    const chosen = launchable.find((candidate) =>
      reservationsAvailable(candidate, group, window, reservations, resourceCapacity, runtimeConstraints)
    );

    if (!chosen) {
      if (group.chits.length > 1) {
        pendingGroups.splice(groupIndex + 1, 0, ...group.chits.map(singleChitGroup));
        continue;
      }
      deficiencyGates.push(...deficienciesForUnplannedGroup(group, evaluations));
      continue;
    }

    const chosenWindow = planningWindowForGroup(group, generatedAt, chosen.route);
    reserveCandidate(chosen, group, chosenWindow, reservations);
    const superWorker = buildTransientSuperWorker(group, chosen);
    transientSuperWorkers.push(superWorker);
    const missionPlan = buildMissionPlan(group, chosen, superWorker, chosenWindow, reservations);
    missionPlans.push(missionPlan);

    if (chosen.launchGate.status === "delayed") {
      deficiencyGates.push(powerDeficiencyForGroup(group, chosen.launchGate, "power_delayed", "warning"));
    }

    markAssetsUsed(chosen, assetIndex);
  }

  const recommendations = buildInfrastructureRecommendations(
    deficiencyGates,
    powerAnalysis,
  );

  return {
    schemaVersion: 1,
    generatedAt,
    normalizedChits,
    assets,
    workers,
    candidates: allCandidates.sort(compareCandidate),
    transientSuperWorkers: transientSuperWorkers.sort(compareById),
    reservations: reservations.sort(compareById),
    missionPlans: missionPlans.sort(compareById),
    deficiencyGates: uniqueDeficiencies(deficiencyGates),
    recommendations,
    scoreBreakdown: aggregateScores(missionPlans),
    powerGateSummary: {
      status: aggregatePowerStatus(missionPlans, powerGate),
      networkState: powerGate.networkState,
      delayedCount: missionPlans.filter((plan) => plan.launchGate.status === "delayed").length,
      blockedCount: allCandidates.filter((candidate) => candidate.launchGate.status === "blocked").length,
      diagnostics: powerAnalysis.diagnostics,
      findings: powerAnalysis.findings,
      recommendations: powerAnalysis.recommendations,
    },
  };
}

function applyRuntimeAssetConstraints(
  assets: readonly DispatchAsset[],
  constraints: NormalizedRuntimeConstraints,
): DispatchAsset[] {
  return assets.map((asset) => {
    const resourceIds = resourceIdsForAsset(asset);
    const unavailable = constraints.unavailableAssetIds.has(asset.id) ||
      resourceIds.some((resourceId) => constraints.unavailableResourceIds.has(resourceId));
    return unavailable ? { ...asset, state: "offline" } : { ...asset };
  });
}

function resourceIdsForAsset(asset: DispatchAsset): StableId[] {
  const rawId = asset.id.startsWith("asset:") ? asset.id.slice("asset:".length) : asset.id;
  return uniqueSorted([
    asset.id,
    rawId,
    `asset:${rawId}`,
    asset.serviceZoneId,
    asset.serviceZoneId ? `station-zone:${asset.serviceZoneId}` : undefined,
    asset.kind === "guideway" ? `guideway-link:${rawId}` : undefined,
  ].filter((resourceId): resourceId is StableId => Boolean(resourceId)));
}

function applyRuntimePowerConstraints(
  gate: PowerLaunchGate,
  constraints: NormalizedRuntimeConstraints,
): PowerLaunchGate {
  if (constraints.powerConstraintIds.length === 0) {
    return gate;
  }
  return {
    ...gate,
    status: "blocked",
    message: `${gate.message} Runtime power constraints remain active on ${constraints.powerConstraintIds.join(", ")}.`,
    reasonCodes: uniqueSorted([...gate.reasonCodes, "runtime-power-constraint"]),
    affectedPowerIds: uniqueSorted([...gate.affectedPowerIds, ...constraints.powerConstraintIds]),
  };
}

type PlanningWindow = {
  startTime: string;
  endTime: string;
};

function groupDispatchChits(chits: readonly DispatchChit[]): DispatchChitGroup[] {
  const groups: DispatchChitGroup[] = [];
  for (const chit of chits) {
    const target = groups.find((group) => canJoinGroup(group, chit).compatible);
    if (target) {
      target.chits.push(chit);
      target.chits.sort(compareChitsForGroup);
      target.chitIds = target.chits.map((groupChit) => groupChit.id);
      target.id = groupIdForChits(target.chits);
      target.manifestKind = manifestKindForChits(target.chits);
      continue;
    }
    groups.push({
      id: groupIdForChits([chit]),
      chitIds: [chit.id],
      chits: [chit],
      manifestKind: manifestKindForChits([chit]),
      compatible: true,
      compatibilityReasons: [],
    });
  }
  return groups.sort((left, right) => compareChitsForGroup(left.chits[0], right.chits[0]));
}

function singleChitGroup(chit: DispatchChit): DispatchChitGroup {
  return {
    id: groupIdForChits([chit]),
    chitIds: [chit.id],
    chits: [chit],
    manifestKind: manifestKindForChits([chit]),
    compatible: true,
    compatibilityReasons: [],
  };
}

function canJoinGroup(group: DispatchChitGroup, chit: DispatchChit): { compatible: boolean; reasons: string[] } {
  const candidateChits = [...group.chits, chit].sort(compareChitsForGroup);
  const reasons: string[] = [];
  if (candidateChits.length > 4) {
    reasons.push("Group exceeds deterministic manifest limit");
  }
  if (!sameStationPair(candidateChits)) {
    reasons.push("Grouped chits must share origin and destination stations");
  }
  if (!timeWindowsIntersect(candidateChits)) {
    reasons.push("Grouped chits do not have overlapping ready/due windows");
  }
  if (!manifestMixAllowed(candidateChits)) {
    reasons.push("Grouped chits have incompatible service classes");
  }
  return { compatible: reasons.length === 0, reasons };
}

function manifestMixAllowed(chits: readonly DispatchChit[]): boolean {
  const kinds = new Set(chits.map((chit) => chit.kind));
  const manifestKinds = new Set(chits.map((chit) => manifestKindForChits([chit])));
  if (manifestKinds.size === 1) {
    if (manifestKinds.has("passenger")) {
      return kinds.size === 1;
    }
    if (manifestKinds.has("cargo")) {
      return cargoKindsCompatible(chits);
    }
    return kinds.size === 1;
  }
  if (manifestKinds.size === 2 && manifestKinds.has("passenger") && manifestKinds.has("cargo")) {
    return chits.every((chit) =>
      chit.requirements.stopSensitivity === "normal" &&
      (chit.kind === "commuter-passenger" || chit.kind === "local-cargo" || chit.kind === "parcel-cargo")
    );
  }
  return false;
}

function cargoKindsCompatible(chits: readonly DispatchChit[]): boolean {
  const cargoKinds = new Set(chits.map((chit) => chit.kind));
  if ([...cargoKinds].some((kind) => ["hazard-cargo", "perishable-cargo", "bulk-cargo"].includes(kind))) {
    return cargoKinds.size === 1;
  }
  if (cargoKinds.has("long-haul-cargo")) {
    return cargoKinds.size === 1;
  }
  return [...cargoKinds].every((kind) =>
    ["local-cargo", "regional-cargo", "parcel-cargo", "maintenance-supplies"].includes(kind)
  );
}

function sameStationPair(chits: readonly DispatchChit[]): boolean {
  const first = chits[0];
  return Boolean(first) && chits.every((chit) =>
    chit.origin.stationId === first.origin.stationId &&
    chit.destination.stationId === first.destination.stationId
  );
}

function timeWindowsIntersect(chits: readonly DispatchChit[]): boolean {
  const readyAt = Math.max(...chits.map((chit) => Date.parse(chit.readyAt)));
  const dueAt = Math.min(...chits.map((chit) => Date.parse(chit.dueAt)));
  return readyAt <= dueAt;
}

function manifestKindForChits(chits: readonly DispatchChit[]): DispatchChitGroup["manifestKind"] {
  const kinds = new Set(chits.map((chit) => {
    if (chit.kind.includes("passenger")) {
      return "passenger";
    }
    if (chit.kind.includes("cargo") || chit.kind === "maintenance-supplies") {
      return "cargo";
    }
    if (chit.kind === "battery-support") {
      return "battery";
    }
    return chit.kind;
  }));
  if (kinds.size > 1) {
    return "mixed";
  }
  return [...kinds][0] as DispatchChitGroup["manifestKind"];
}

function groupIdForChits(chits: readonly DispatchChit[]): StableId {
  return `group:${chits.map((chit) => chit.id).sort().join("+")}`;
}

function compareChitsForGroup(left: DispatchChit | undefined, right: DispatchChit | undefined): number {
  if (!left || !right) {
    return left ? -1 : right ? 1 : 0;
  }
  const priorityCompare = right.priority - left.priority;
  if (priorityCompare !== 0) {
    return priorityCompare;
  }
  const dueCompare = Date.parse(left.dueAt) - Date.parse(right.dueAt);
  return dueCompare === 0 ? left.id.localeCompare(right.id) : dueCompare;
}

function routeForGroup(
  group: DispatchChitGroup,
  input: DispatchPlannerInput,
  constraints: NormalizedRuntimeConstraints,
): GuidewayRoute {
  const endpoints = uniqueEndpoints(group.chits.flatMap((chit) => [chit.origin, chit.destination]));
  const blockUnavailableLinks = (route: GuidewayRoute): GuidewayRoute =>
    route.linkIds.some((linkId) =>
      constraints.unavailableResourceIds.has(linkId) ||
      constraints.unavailableResourceIds.has(`guideway-link:${linkId}`)
    )
      ? { ...route, reachable: false }
      : route;
  if (endpoints.length === 0) {
    return blockUnavailableLinks(routeBetweenEndpoints(input.guideway, group.chits[0].origin, group.chits[0].destination));
  }
  if (endpoints.length === 1) {
    return blockUnavailableLinks(routeBetweenEndpoints(input.guideway, endpoints[0], endpoints[0]));
  }

  const segments = endpoints.slice(1).map((endpoint, index) =>
    blockUnavailableLinks(routeBetweenEndpoints(input.guideway, endpoints[index], endpoint))
  );
  if (segments.some((route) => !route.reachable)) {
    return segments.find((route) => !route.reachable) as GuidewayRoute;
  }
  return {
    originNodeId: segments[0].originNodeId,
    destinationNodeId: segments[segments.length - 1].destinationNodeId,
    pathNodeIds: uniqueSorted(segments.flatMap((route) => route.pathNodeIds)),
    linkIds: uniqueSorted(segments.flatMap((route) => route.linkIds)),
    hopCount: segments.reduce((sum, route) => sum + route.hopCount, 0),
    cost: round(segments.reduce((sum, route) => sum + route.cost, 0)),
    reachable: true,
  };
}

function planningWindowForGroup(
  group: DispatchChitGroup,
  generatedAt: string,
  route: GuidewayRoute = {
    originNodeId: "pending",
    destinationNodeId: "pending",
    pathNodeIds: [],
    linkIds: [],
    hopCount: 0,
    cost: 0,
    reachable: true,
  },
): PlanningWindow {
  const startTime = new Date(Math.max(Date.parse(generatedAt), ...group.chits.map((chit) => Date.parse(chit.readyAt)))).toISOString();
  return {
    startTime,
    endTime: endTimeFor(startTime, route),
  };
}

function reservationsOverlap(left: PlanningWindow, right: Pick<DispatchReservation, "startTime" | "endTime">): boolean {
  return Date.parse(left.startTime) < Date.parse(right.endTime) && Date.parse(right.startTime) < Date.parse(left.endTime);
}

function uniqueEndpoints(endpoints: readonly DispatchChit["origin"][]): DispatchChit["origin"][] {
  const byKey = new Map<string, DispatchChit["origin"]>();
  for (const endpoint of endpoints) {
    byKey.set(`${endpoint.stationId}:${endpoint.serviceZoneId ?? ""}`, endpoint);
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.stationId}:${left.serviceZoneId ?? ""}`.localeCompare(`${right.stationId}:${right.serviceZoneId ?? ""}`)
  );
}

function evaluateCandidate(input: {
  group: DispatchChitGroup;
  primaryWorker: DispatchWorker;
  vehicleWorkers: readonly DispatchWorker[];
  workers: readonly DispatchWorker[];
  assets: readonly DispatchAsset[];
  powerGate: PowerLaunchGate;
  input: DispatchPlannerInput;
  runtimeConstraints: NormalizedRuntimeConstraints;
}): CandidateEvaluation {
  const supportWorkers = supportWorkersForGroup(input.group, input.workers);
  const primaryWorkers = selectPrimaryWorkersForGroup(input.group, input.primaryWorker, input.vehicleWorkers);
  const match = matchWorkersToGroup(input.group, primaryWorkers, supportWorkers, input.assets);
  const route = routeForGroup(input.group, input.input, input.runtimeConstraints);
  const score = scoreCandidate(input.group, primaryWorkers, supportWorkers, route, input.powerGate, match);
  const supportWorkerIds = supportWorkers.map((worker) => worker.id).sort();
  const primaryWorkerIds = primaryWorkers.map((worker) => worker.id).sort();
  const assetIds = uniqueSorted([
    ...primaryWorkers.flatMap((worker) => worker.assetIds),
    ...supportWorkers.flatMap((worker) => worker.assetIds),
  ]);

  return {
    chitId: input.group.chits[0]?.id ?? input.group.id,
    chitIds: [...input.group.chitIds],
    workerId: input.primaryWorker.id,
    workerIds: primaryWorkerIds,
    supportWorkerIds,
    assetIds,
    match,
    route,
    launchGate: input.powerGate,
    score,
    group: input.group,
    primaryWorker: input.primaryWorker,
    primaryWorkers,
    supportWorkers,
  };
}

function supportWorkersForGroup(
  group: DispatchChitGroup,
  workers: readonly DispatchWorker[],
): DispatchWorker[] {
  const zoneIds = uniqueSorted(group.chits.flatMap((chit) => [
    chit.origin.serviceZoneId,
    chit.destination.serviceZoneId,
  ].filter((id): id is StableId => Boolean(id))));
  const zoneWorkers = supportWorkersForServiceZones(workers, zoneIds);
  const selected = new Map<StableId, DispatchWorker>();

  for (const zoneId of zoneIds) {
    for (const capability of requiredSupportCapabilities(group)) {
      const worker = zoneWorkers.find((candidate) =>
        candidate.serviceZoneId === zoneId && candidate.capabilities.includes(capability)
      );
      if (worker) {
        selected.set(worker.id, worker);
      }
    }
  }

  return [...selected.values()].sort(compareById);
}

function selectPrimaryWorkersForGroup(
  group: DispatchChitGroup,
  primaryWorker: DispatchWorker,
  vehicleWorkers: readonly DispatchWorker[],
): DispatchWorker[] {
  const selected = new Map<StableId, DispatchWorker>([[primaryWorker.id, primaryWorker]]);
  let aggregate = aggregateCapacity([...selected.values()]);
  let capabilities = aggregateCapabilities([...selected.values()]);

  for (const chit of group.chits) {
    if (workerSetCoversChit(chit, aggregate, capabilities)) {
      continue;
    }
    const nextWorker = vehicleWorkers.find((worker) =>
      !selected.has(worker.id) &&
      worker.state === "available" &&
      singleWorkerCanServeChit(worker, chit)
    );
    if (nextWorker) {
      selected.set(nextWorker.id, nextWorker);
      aggregate = aggregateCapacity([...selected.values()]);
      capabilities = aggregateCapabilities([...selected.values()]);
    }
  }

  return [...selected.values()].sort(compareById);
}

function matchWorkersToGroup(
  group: DispatchChitGroup,
  primaryWorkers: readonly DispatchWorker[],
  supportWorkers: readonly DispatchWorker[],
  assets: readonly DispatchAsset[],
): CapabilityMatch {
  const combinedCapabilities = new Set([
    ...primaryWorkers.flatMap((worker) => worker.capabilities),
    ...supportWorkers.flatMap((supportWorker) => supportWorker.capabilities),
  ]);
  const primaryCapabilities = new Set(primaryWorkers.flatMap((worker) => worker.capabilities));
  const requiredCapabilities = uniqueSorted(group.chits.flatMap((chit) => [
    ...chit.requirements.requiredCapabilities,
    ...requiredCapabilitiesForKind(chit.kind),
  ]));
  const requiredVehicleClasses = uniqueSorted(group.chits.flatMap((chit) => [
    ...chit.requirements.requiredVehicleClasses,
    ...requiredVehicleClassesForKind(chit.kind),
  ]));
  const forbiddenVehicleClasses = uniqueSorted(group.chits.flatMap((chit) => chit.requirements.forbiddenVehicleClasses ?? []));
  const missingCapabilities = requiredCapabilities.filter((capability) => !combinedCapabilities.has(capability));
  const missingVehicleClasses = requiredVehicleClasses.filter((vehicleClass) => !primaryCapabilities.has(vehicleClass));
  const forbiddenCapabilities = forbiddenVehicleClasses.filter((vehicleClass) =>
    primaryCapabilities.has(vehicleClass)
  );
  const capacityDeficits = capacityDeficitsForGroup(group, primaryWorkers, assets);
  const compatibilityWarnings = compatibilityWarningsForGroup(group, supportWorkers);
  const reasons = [
    ...group.compatibilityReasons,
    ...missingCapabilities.map((capability) => `Missing capability ${capability}`),
    ...missingVehicleClasses.map((vehicleClass) => `Missing vehicle class ${vehicleClass}`),
    ...forbiddenCapabilities.map((vehicleClass) => `Forbidden vehicle class ${vehicleClass}`),
    ...capacityDeficits,
    ...primaryWorkers.filter((worker) => worker.state !== "available").map((worker) => `Worker ${worker.id} state is ${worker.state}`),
  ];

  return {
    eligible: reasons.length === 0,
    score: round(100 - reasons.length * 25 - compatibilityWarnings.length * 5),
    reasons,
    missingCapabilities: uniqueSorted([...missingCapabilities, ...missingVehicleClasses]),
    forbiddenCapabilities,
    capacityDeficits,
    compatibilityWarnings,
  };
}

function capacityDeficitsForChit(
  chit: DispatchChit,
  worker: DispatchWorker,
  assets: readonly DispatchAsset[],
): string[] {
  const deficits: string[] = [];
  if ((chit.quantity.passengers ?? 0) > (worker.capacity.passengers ?? 0)) {
    deficits.push(`Needs ${chit.quantity.passengers ?? 0} passengers, worker carries ${worker.capacity.passengers ?? 0}`);
  }
  if ((chit.quantity.massKg ?? 0) > (worker.capacity.massKg ?? 0)) {
    deficits.push(`Needs ${chit.quantity.massKg ?? 0} kg, worker carries ${worker.capacity.massKg ?? 0} kg`);
  }
  if ((chit.quantity.volumeLiters ?? 0) > (worker.capacity.volumeLiters ?? 0)) {
    deficits.push(`Needs ${chit.quantity.volumeLiters ?? 0} L, worker carries ${worker.capacity.volumeLiters ?? 0} L`);
  }
  if ((chit.quantity.energyWh ?? 0) > (worker.capacity.energyWh ?? 0)) {
    deficits.push(`Needs ${chit.quantity.energyWh ?? 0} Wh, worker carries ${worker.capacity.energyWh ?? 0} Wh`);
  }

  const primaryAsset = assets.find((asset) => worker.assetIds.includes(asset.id));
  if (
    primaryAsset?.battery &&
    (chit.quantity.energyWh ?? 0) > 0 &&
    primaryAsset.battery.stateOfChargeWh < (chit.quantity.energyWh ?? 0)
  ) {
    deficits.push(
      `Needs ${chit.quantity.energyWh ?? 0} Wh state of charge, asset has ${primaryAsset.battery.stateOfChargeWh} Wh`,
    );
  }
  return deficits;
}

function capacityDeficitsForGroup(
  group: DispatchChitGroup,
  primaryWorkers: readonly DispatchWorker[],
  assets: readonly DispatchAsset[],
): string[] {
  const deficits = capacityDeficitsForChit(aggregateChitForGroup(group), {
    id: `aggregate-worker:${group.id}`,
    kind: "composite",
    label: group.id,
    assetIds: primaryWorkers.flatMap((worker) => worker.assetIds),
    state: primaryWorkers.every((worker) => worker.state === "available") ? "available" : "reserved",
    capabilities: [...aggregateCapabilities(primaryWorkers)],
    capacity: aggregateCapacity(primaryWorkers),
    source: "transient",
  }, assets);

  const aggregate = aggregateCapacity(primaryWorkers);
  const capabilities = aggregateCapabilities(primaryWorkers);
  for (const chit of group.chits) {
    if (!workerSetCoversChit(chit, aggregate, capabilities)) {
      deficits.push(`Grouped manifest cannot cover ${chit.id}`);
    }
  }

  return uniqueSorted(deficits);
}

function compatibilityWarningsForGroup(
  group: DispatchChitGroup,
  supportWorkers: readonly DispatchWorker[],
): string[] {
  if (group.chits.some((chit) => chit.kind === "hazard-cargo") && !supportWorkers.some((worker) => worker.capabilities.includes("hazard-handling"))) {
    return ["Hazard cargo requires a hazard-capable depot support worker"];
  }
  if (group.chits.some((chit) => chit.kind === "perishable-cargo") && !supportWorkers.some((worker) => worker.capabilities.includes("cold-chain"))) {
    return ["Perishable cargo requires a cold-chain support worker"];
  }
  return [];
}

function requiredSupportCapabilities(group: DispatchChitGroup): StableId[] {
  const capabilities = new Set<StableId>();
  for (const chit of group.chits) {
    if (chit.kind.includes("passenger")) {
      capabilities.add("passenger-boarding");
    }
    if (chit.kind.includes("cargo") || chit.kind === "maintenance-supplies") {
      capabilities.add("cargo-handling");
    }
    if (chit.kind === "battery-support") {
      capabilities.add("charging");
    }
    if (chit.kind === "maintenance") {
      capabilities.add("maintenance");
    }
  }
  return [...capabilities].sort();
}

function aggregateChitForGroup(group: DispatchChitGroup): DispatchChit {
  const chits = group.chits;
  const first = chits[0];
  return {
    ...first,
    id: group.id,
    sourceChitId: group.id,
    contractId: `contract:${group.id}`,
    priority: Math.max(...chits.map((chit) => chit.priority)),
    quantity: aggregateQuantity(chits),
    requirements: {
      requiredVehicleClasses: uniqueSorted(chits.flatMap((chit) => [
        ...chit.requirements.requiredVehicleClasses,
        ...requiredVehicleClassesForKind(chit.kind),
      ])),
      forbiddenVehicleClasses: uniqueSorted(chits.flatMap((chit) => chit.requirements.forbiddenVehicleClasses ?? [])),
      requiredCapabilities: uniqueSorted(chits.flatMap((chit) => [
        ...chit.requirements.requiredCapabilities,
        ...requiredCapabilitiesForKind(chit.kind),
      ])),
      stopSensitivity: chits.some((chit) => chit.requirements.stopSensitivity === "direct")
        ? "direct"
        : chits.some((chit) => chit.requirements.stopSensitivity === "express")
          ? "express"
          : "normal",
    },
    penalties: {
      waitPerMinute: Math.max(...chits.map((chit) => chit.penalties.waitPerMinute)),
      latePerMinute: Math.max(...chits.map((chit) => chit.penalties.latePerMinute)),
      transfer: Math.max(...chits.map((chit) => chit.penalties.transfer)),
      handling: Math.max(...chits.map((chit) => chit.penalties.handling)),
    },
    readyAt: new Date(Math.max(...chits.map((chit) => Date.parse(chit.readyAt)))).toISOString(),
    dueAt: new Date(Math.min(...chits.map((chit) => Date.parse(chit.dueAt)))).toISOString(),
    rankScore: Math.max(...chits.map((chit) => chit.rankScore)),
  };
}

function aggregateQuantity(chits: readonly DispatchChit[]): DispatchChit["quantity"] {
  return {
    passengers: sumOptional(chits, (chit) => chit.quantity.passengers),
    massKg: sumOptional(chits, (chit) => chit.quantity.massKg),
    volumeLiters: sumOptional(chits, (chit) => chit.quantity.volumeLiters),
    energyWh: sumOptional(chits, (chit) => chit.quantity.energyWh),
  };
}

function aggregateCapacity(workers: readonly DispatchWorker[]): DispatchWorker["capacity"] {
  return {
    passengers: sumOptional(workers, (worker) => worker.capacity.passengers),
    massKg: sumOptional(workers, (worker) => worker.capacity.massKg),
    volumeLiters: sumOptional(workers, (worker) => worker.capacity.volumeLiters),
    energyWh: sumOptional(workers, (worker) => worker.capacity.energyWh),
  };
}

function aggregateCapabilities(workers: readonly DispatchWorker[]): Set<StableId> {
  return new Set(workers.flatMap((worker) => worker.capabilities));
}

function workerSetCoversChit(
  chit: DispatchChit,
  capacity: DispatchWorker["capacity"],
  capabilities: ReadonlySet<StableId>,
): boolean {
  return [
    ...chit.requirements.requiredCapabilities,
    ...requiredCapabilitiesForKind(chit.kind),
    ...chit.requirements.requiredVehicleClasses,
    ...requiredVehicleClassesForKind(chit.kind),
  ].every((capability) => capabilities.has(capability)) &&
    quantityFits(chit.quantity.passengers, capacity.passengers) &&
    quantityFits(chit.quantity.massKg, capacity.massKg) &&
    quantityFits(chit.quantity.volumeLiters, capacity.volumeLiters) &&
    quantityFits(chit.quantity.energyWh, capacity.energyWh);
}

function singleWorkerCanServeChit(worker: DispatchWorker, chit: DispatchChit): boolean {
  return workerSetCoversChit(chit, worker.capacity, new Set(worker.capabilities));
}

function minimumPrimaryWorkerCount(group: DispatchChitGroup): number {
  const requiredClasses = new Set(group.chits.flatMap((chit) => [
    ...chit.requirements.requiredVehicleClasses,
    ...requiredVehicleClassesForKind(chit.kind),
  ]));
  return Math.max(1, requiredClasses.size);
}

function quantityFits(required: number | undefined, available: number | undefined): boolean {
  return !required || required <= 0 || (available ?? 0) >= required;
}

function sumOptional<T>(values: readonly T[], read: (value: T) => number | undefined): number | undefined {
  const sum = values.reduce((total, value) => total + (read(value) ?? 0), 0);
  return sum > 0 ? sum : undefined;
}

function scoreCandidate(
  group: DispatchChitGroup,
  primaryWorkers: readonly DispatchWorker[],
  supportWorkers: readonly DispatchWorker[],
  route: GuidewayRoute,
  gate: PowerLaunchGate,
  match: CapabilityMatch,
): DispatchScoreBreakdown {
  const aggregateChit = aggregateChitForGroup(group);
  const capacityHeadroom = capacityHeadroomScore(aggregateChit, aggregateCapacity(primaryWorkers));
  const routeEfficiency = route.reachable ? Math.max(0, 100 - route.cost * 8) : 0;
  const powerReadiness = gate.status === "allowed" ? 100 : gate.status === "delayed" ? 45 : 0;
  const deadlineUrgency = Math.max(0, 100 - Math.max(0, Date.parse(aggregateChit.dueAt) - Date.parse(aggregateChit.readyAt)) / 60_000);
  const reservationPenalty = (supportWorkers.length > 2 ? -5 : 0) -
    Math.max(0, primaryWorkers.length - minimumPrimaryWorkerCount(group)) * 18;
  const priority = Math.min(100, aggregateChit.priority);
  const capabilityFit = match.score;
  const total = round(
    priority * 0.24 +
    deadlineUrgency * 0.12 +
    routeEfficiency * 0.2 +
    capabilityFit * 0.22 +
    capacityHeadroom * 0.12 +
    powerReadiness * 0.1 +
    reservationPenalty,
  );

  return {
    priority: round(priority),
    deadlineUrgency: round(deadlineUrgency),
    routeEfficiency: round(routeEfficiency),
    capabilityFit: round(capabilityFit),
    capacityHeadroom: round(capacityHeadroom),
    powerReadiness: round(powerReadiness),
    reservationPenalty: round(reservationPenalty),
    total,
  };
}

function reservationsAvailable(
  candidate: CandidateEvaluation,
  group: DispatchChitGroup,
  window: PlanningWindow,
  reservations: readonly DispatchReservation[],
  resourceCapacity: ReadonlyMap<StableId, number>,
  constraints: NormalizedRuntimeConstraints,
): boolean {
  return reservationResources(candidate, group).every((resourceId) => {
    if (constraints.unavailableResourceIds.has(resourceId)) {
      return false;
    }
    const overlappingReservations = reservations.filter((reservation) =>
      reservation.resourceId === resourceId && reservationsOverlap(window, reservation)
    );
    return overlappingReservations.length < (resourceCapacity.get(resourceId) ?? 1);
  });
}

function reserveCandidate(
  candidate: CandidateEvaluation,
  group: DispatchChitGroup,
  window: PlanningWindow,
  reservations: DispatchReservation[],
): void {
  const missionPlanId = missionPlanIdFor(group, candidate);
  for (const resourceId of reservationResources(candidate, group)) {
    reservations.push({
      id: `reservation:${missionPlanId}:${resourceId}`,
      missionPlanId,
      resourceType: reservationTypeForResource(resourceId),
      resourceId,
      startTime: window.startTime,
      endTime: window.endTime,
      chitIds: [...group.chitIds],
    });
  }
}

function buildTransientSuperWorker(
  group: DispatchChitGroup,
  candidate: CandidateEvaluation,
): TransientSuperWorker {
  const supportWorkerIds = candidate.supportWorkers.map((worker) => worker.id).sort();
  return {
    id: superWorkerIdFor(group, candidate),
    kind: "transient-super-worker",
    label: `${group.id} consist`,
    chitIds: [...group.chitIds],
    workerIds: [...candidate.workerIds, ...supportWorkerIds].sort(),
    assetIds: [...candidate.assetIds].sort(),
    capabilities: uniqueSorted([
      ...candidate.primaryWorkers.flatMap((worker) => worker.capabilities),
      ...candidate.supportWorkers.flatMap((worker) => worker.capabilities),
    ]),
    capacity: aggregateCapacity(candidate.primaryWorkers),
    primaryWorkerId: candidate.primaryWorker.id,
    supportWorkerIds,
    formationReason: `Formed deterministically for ${group.manifestKind} manifest ${group.chitIds.join(", ")}.`,
  };
}

function buildMissionPlan(
  group: DispatchChitGroup,
  candidate: CandidateEvaluation,
  superWorker: TransientSuperWorker,
  window: PlanningWindow,
  reservations: readonly DispatchReservation[],
): MissionPlan {
  const id = missionPlanIdFor(group, candidate);
  const reservationIds = reservations
    .filter((reservation) => reservation.missionPlanId === id)
    .map((reservation) => reservation.id)
    .sort();

  return {
    id,
    chitId: group.chits[0]?.id ?? group.id,
    chitIds: [...group.chitIds],
    state: candidate.launchGate.status === "delayed" ? "delayed" : "planned",
    superWorkerId: superWorker.id,
    workerIds: [...superWorker.workerIds],
    assetIds: [...superWorker.assetIds],
    route: candidate.route,
    launchGate: candidate.launchGate,
    reservationIds,
    score: candidate.score,
    startsAt: window.startTime,
    endsAt: window.endTime,
    steps: missionSteps(group, candidate, superWorker),
  };
}

function missionSteps(
  group: DispatchChitGroup,
  candidate: CandidateEvaluation,
  superWorker: TransientSuperWorker,
): MissionPlanStep[] {
  return [
    {
      id: `step:${group.id}:stage`,
      label: "Stage persistent assets",
      resourceIds: superWorker.assetIds,
    },
    {
      id: `step:${group.id}:reserve-route`,
      label: "Reserve guideway path",
      resourceIds: candidate.route.linkIds,
    },
    {
      id: `step:${group.id}:launch-gate`,
      label: `Power launch gate: ${candidate.launchGate.status}`,
      resourceIds: candidate.launchGate.affectedPowerIds,
    },
  ];
}

function deficienciesForUnplannedGroup(
  group: DispatchChitGroup,
  evaluations: readonly CandidateEvaluation[],
): DeficiencyGate[] {
  if (evaluations.some((candidate) => candidate.launchGate.status === "blocked")) {
    return [powerDeficiencyForGroup(group, evaluations[0].launchGate, "power_blocked", "error")];
  }
  if (evaluations.length === 0) {
    return [deficiency({
      id: `deficiency:${group.id}:no-candidate`,
      kind: "no_candidate",
      severity: "error",
      message: `${group.id} has no candidate worker.`,
      action: "Add an asset with the required vehicle class and capabilities.",
      chitIds: group.chitIds,
    })];
  }

  const routeFailures = evaluations.filter((candidate) => !candidate.route.reachable);
  if (routeFailures.length === evaluations.length) {
    return [deficiency({
      id: `deficiency:${group.id}:route`,
      kind: "route_unreachable",
      severity: "error",
      message: `${group.id} cannot reach its destination on the extracted guideway graph.`,
      action: "Add or rotate guideway tiles so the origin and destination service zones are connected.",
      chitIds: group.chitIds,
      affectedIds: uniqueSorted(routeFailures.flatMap((candidate) => [
        candidate.route.originNodeId,
        candidate.route.destinationNodeId,
      ])),
    })];
  }

  const capacityDeficits = uniqueSorted(evaluations.flatMap((candidate) => candidate.match.capacityDeficits));
  const stateOfChargeDeficits = capacityDeficits.filter((item) => item.includes("state of charge"));
  if (stateOfChargeDeficits.length > 0) {
    return [deficiency({
      id: `deficiency:${group.id}:state-of-charge`,
      kind: "state_of_charge",
      severity: "error",
      message: `${group.id} requires more onboard state of charge than any compatible asset has available.`,
      action: "Recharge or stage a battery-support asset with enough usable state of charge.",
      chitIds: group.chitIds,
      affectedIds: stateOfChargeDeficits,
    })];
  }
  const missingCapabilities = uniqueSorted(evaluations.flatMap((candidate) => candidate.match.missingCapabilities));
  if (missingCapabilities.length > 0) {
    return [deficiency({
      id: `deficiency:${group.id}:capability`,
      kind: "missing_capability",
      severity: "error",
      message: `${group.id} requires capabilities that no candidate super-worker can supply.`,
      action: `Add assets with capabilities: ${missingCapabilities.join(", ")}.`,
      chitIds: group.chitIds,
      affectedIds: missingCapabilities,
    })];
  }
  if (capacityDeficits.length > 0) {
    return [deficiency({
      id: `deficiency:${group.id}:capacity`,
      kind: "insufficient_capacity",
      severity: "error",
      message: `${group.id} exceeds available worker capacity.`,
      action: "Add a larger vehicle or split the chit before dispatch planning.",
      chitIds: group.chitIds,
      affectedIds: capacityDeficits,
    })];
  }

  if (evaluations.some((candidate) => candidate.match.reasons.some((reason) => reason.includes("maintenance")))) {
    return [deficiency({
      id: `deficiency:${group.id}:maintenance`,
      kind: "maintenance_required",
      severity: "error",
      message: `${group.id} only matched assets that are in maintenance.`,
      action: "Return a compatible asset to service or add another compatible asset.",
      chitIds: group.chitIds,
      assetIds: evaluations.flatMap((candidate) => candidate.assetIds),
    })];
  }

  return [deficiency({
    id: `deficiency:${group.id}:reservation`,
    kind: "reservation_conflict",
    severity: "warning",
    message: `${group.id} has eligible candidates but all overlapping required resources are already reserved.`,
    action: "Stage an additional compatible asset or move one mission to a later planning window.",
    chitIds: group.chitIds,
    assetIds: evaluations.flatMap((candidate) => candidate.assetIds),
  })];
}

function powerDeficiencyForGroup(
  group: DispatchChitGroup,
  gate: PowerLaunchGate,
  kind: "power_blocked" | "power_delayed",
  severity: "warning" | "error",
): DeficiencyGate {
  return deficiency({
    id: `deficiency:${group.id}:${kind}`,
    kind,
    severity,
    message: `${group.id} launch is ${gate.status}: ${gate.message}`,
    action: gate.supportAssetIds.length > 0
      ? `Review supporting assets ${gate.supportAssetIds.join(", ")} and clear power diagnostics.`
      : "Add power support or fix the blocking power diagnostics before dispatch.",
    chitIds: group.chitIds,
    assetIds: gate.supportAssetIds,
    affectedIds: gate.affectedPowerIds,
  });
}

function buildInfrastructureRecommendations(
  deficiencies: readonly DeficiencyGate[],
  power: PowerAnalysisResult,
): InfrastructureRecommendation[] {
  const direct = deficiencies.map((gate, index) => recommendationForDeficiency(gate, index));
  const powerRecommendations = power.recommendations.slice(0, 3).map<InfrastructureRecommendation>((recommendation, index) => ({
    id: `recommendation:power:${recommendation.id}`,
    priority: 80 - index,
    kind: recommendation.type === "add_source" ? "add_power_source" : "reinforce_power",
    action: recommendation.proposedChange,
    rationale: recommendation.observedDeficiency,
    deficiencyIds: deficiencies
      .filter((deficiencyGate) => deficiencyGate.kind === "power_blocked" || deficiencyGate.kind === "power_delayed")
      .map((deficiencyGate) => deficiencyGate.id),
    affectedIds: recommendation.affectedIds,
  }));
  return [...direct, ...powerRecommendations]
    .filter((recommendation, index, list) => list.findIndex((candidate) => candidate.id === recommendation.id) === index)
    .sort((left, right) => {
      const priorityCompare = right.priority - left.priority;
      return priorityCompare === 0 ? left.id.localeCompare(right.id) : priorityCompare;
    });
}

function recommendationForDeficiency(gate: DeficiencyGate, index: number): InfrastructureRecommendation {
  switch (gate.kind) {
    case "missing_capability":
      return baseRecommendation(gate, index, "add_service_asset", gate.action);
    case "insufficient_capacity":
      return baseRecommendation(gate, index, "add_vehicle", gate.action);
    case "route_unreachable":
      return baseRecommendation(gate, index, "add_guideway", gate.action);
    case "power_blocked":
    case "power_delayed":
      return baseRecommendation(gate, index, "reinforce_power", gate.action);
    case "reservation_conflict":
      return baseRecommendation(gate, index, "stage_asset", gate.action);
    case "service_zone_full":
      return baseRecommendation(gate, index, "expand_service_zone", gate.action);
    case "asset_unavailable":
    case "maintenance_required":
    case "state_of_charge":
    case "incompatible_group":
    case "no_candidate":
      return baseRecommendation(gate, index, "add_vehicle", gate.action);
  }
}

function baseRecommendation(
  gate: DeficiencyGate,
  index: number,
  kind: InfrastructureRecommendation["kind"],
  action: string,
): InfrastructureRecommendation {
  return {
    id: `recommendation:${gate.id}`,
    priority: 70 - index,
    kind,
    action,
    rationale: gate.message,
    deficiencyIds: [gate.id],
    affectedIds: gate.affectedIds,
  };
}

function reservationResources(candidate: CandidateEvaluation, group: DispatchChitGroup): StableId[] {
  return uniqueSorted([
    ...candidate.primaryWorkers.flatMap((worker) => worker.assetIds.map((assetId) => `asset:${assetId}`)),
    ...candidate.route.linkIds.map((linkId) => `guideway-link:${linkId}`),
    ...group.chits.flatMap((chit) => [
      chit.origin.serviceZoneId ? `station-zone:${chit.origin.serviceZoneId}` : undefined,
      chit.destination.serviceZoneId ? `station-zone:${chit.destination.serviceZoneId}` : undefined,
    ].filter((resourceId): resourceId is StableId => Boolean(resourceId))),
    `power-window:${candidate.launchGate.networkState}`,
  ]);
}

function reservationCapacityIndex(scenario: ScenarioDocumentV1): Map<StableId, number> {
  const capacity = new Map<StableId, number>();
  for (const zone of scenario.serviceZones) {
    capacity.set(`station-zone:${zone.id}`, zone.capacity);
  }
  for (const link of scenario.guideway.links) {
    capacity.set(`guideway-link:${link.id}`, 1);
  }
  for (const vehicle of scenario.inventory.vehicles) {
    capacity.set(`asset:${vehicle.id}`, 1);
  }
  capacity.set("power-window:nominal", Number.POSITIVE_INFINITY);
  capacity.set("power-window:degraded", Number.POSITIVE_INFINITY);
  capacity.set("power-window:brownout", Number.POSITIVE_INFINITY);
  capacity.set("power-window:overloaded", Number.POSITIVE_INFINITY);
  capacity.set("power-window:source_limited", Number.POSITIVE_INFINITY);
  capacity.set("power-window:non_converged", Number.POSITIVE_INFINITY);
  capacity.set("power-window:islanded", Number.POSITIVE_INFINITY);
  capacity.set("power-window:invalid", Number.POSITIVE_INFINITY);
  return capacity;
}

function reservationTypeForResource(resourceId: StableId): DispatchReservation["resourceType"] {
  if (resourceId.startsWith("asset:")) {
    return "asset";
  }
  if (resourceId.startsWith("guideway-link:")) {
    return "guideway-link";
  }
  if (resourceId.startsWith("station-zone:")) {
    return "station-zone";
  }
  return "power-window";
}

function markAssetsUsed(
  candidate: CandidateEvaluation,
  assetIndex: ReadonlyMap<StableId, DispatchAsset>,
): void {
  for (const assetId of candidate.primaryWorkers.flatMap((worker) => worker.assetIds)) {
    const asset = assetIndex.get(assetId);
    if (asset) {
      asset.state = "reserved";
    }
  }
}

function aggregateScores(missionPlans: readonly MissionPlan[]): DispatchScoreBreakdown {
  if (missionPlans.length === 0) {
    return zeroScore();
  }
  return {
    priority: average(missionPlans, (plan) => plan.score.priority),
    deadlineUrgency: average(missionPlans, (plan) => plan.score.deadlineUrgency),
    routeEfficiency: average(missionPlans, (plan) => plan.score.routeEfficiency),
    capabilityFit: average(missionPlans, (plan) => plan.score.capabilityFit),
    capacityHeadroom: average(missionPlans, (plan) => plan.score.capacityHeadroom),
    powerReadiness: average(missionPlans, (plan) => plan.score.powerReadiness),
    reservationPenalty: average(missionPlans, (plan) => plan.score.reservationPenalty),
    total: average(missionPlans, (plan) => plan.score.total),
  };
}

function aggregatePowerStatus(
  missionPlans: readonly MissionPlan[],
  gate: PowerLaunchGate,
): PowerLaunchGate["status"] {
  if (missionPlans.some((plan) => plan.launchGate.status === "blocked")) {
    return "blocked";
  }
  if (missionPlans.some((plan) => plan.launchGate.status === "delayed")) {
    return "delayed";
  }
  return gate.status;
}

function stripCandidateRuntime(candidate: CandidateEvaluation): DispatchCandidate {
  return {
    chitId: candidate.chitId,
    chitIds: candidate.chitIds,
    workerId: candidate.workerId,
    workerIds: candidate.workerIds,
    supportWorkerIds: candidate.supportWorkerIds,
    assetIds: candidate.assetIds,
    match: candidate.match,
    route: candidate.route,
    launchGate: candidate.launchGate,
    score: candidate.score,
  };
}

function missionPlanIdFor(group: DispatchChitGroup, candidate: CandidateEvaluation): StableId {
  return `mission:${group.id}:${candidate.workerIds.join("+")}`;
}

function superWorkerIdFor(group: DispatchChitGroup, candidate: CandidateEvaluation): StableId {
  const support = candidate.supportWorkerIds.length > 0 ? `:${candidate.supportWorkerIds.join("+")}` : "";
  return `super:${group.id}:${candidate.workerIds.join("+")}${support}`;
}

function endTimeFor(startTime: string, route: GuidewayRoute): string {
  const durationSeconds = Math.max(60, Math.ceil(route.cost * 90) + 120);
  return new Date(Date.parse(startTime) + durationSeconds * 1000).toISOString();
}

function capacityHeadroomScore(chit: DispatchChit, capacity: DispatchWorker["capacity"]): number {
  const ratios = [
    ratio(chit.quantity.passengers, capacity.passengers),
    ratio(chit.quantity.massKg, capacity.massKg),
    ratio(chit.quantity.volumeLiters, capacity.volumeLiters),
    ratio(chit.quantity.energyWh, capacity.energyWh),
  ].filter((value): value is number => typeof value === "number");
  if (ratios.length === 0) {
    return 100;
  }
  const worst = Math.max(...ratios);
  return Math.max(0, Math.min(100, (1 - worst) * 100));
}

function ratio(required?: number, available?: number): number | undefined {
  if (!required || required <= 0) {
    return undefined;
  }
  if (!available || available <= 0) {
    return 1;
  }
  return required / available;
}

function zeroScore(): DispatchScoreBreakdown {
  return {
    priority: 0,
    deadlineUrgency: 0,
    routeEfficiency: 0,
    capabilityFit: 0,
    capacityHeadroom: 0,
    powerReadiness: 0,
    reservationPenalty: 0,
    total: 0,
  };
}

function average<T>(values: readonly T[], read: (value: T) => number): number {
  return round(values.reduce((sum, value) => sum + read(value), 0) / values.length);
}

function deficiency(input: Omit<DeficiencyGate, "assetIds" | "affectedIds"> & {
  assetIds?: readonly StableId[];
  affectedIds?: readonly StableId[];
}): DeficiencyGate {
  return {
    ...input,
    assetIds: uniqueSorted(input.assetIds ?? []),
    affectedIds: uniqueSorted(input.affectedIds ?? []),
  };
}

function uniqueDeficiencies(deficiencies: readonly DeficiencyGate[]): DeficiencyGate[] {
  return [...new Map(deficiencies.map((gate) => [gate.id, gate])).values()].sort(compareById);
}

function electricalInputFromScenario(scenario: ScenarioDocumentV1): PowerNetworkInput {
  return {
    nodes: scenario.electrical.nodes.map((node) => ({ ...node })),
    branches: scenario.electrical.branches.map((branch) => ({ ...branch })),
    sources: scenario.electrical.sources.map((source) => ({ ...source })),
    loads: scenario.electrical.loads.map((load) => ({ ...load })),
  };
}

function compareCandidateEvaluations(left: CandidateEvaluation, right: CandidateEvaluation): number {
  const eligibleCompare = Number(right.match.eligible) - Number(left.match.eligible);
  if (eligibleCompare !== 0) {
    return eligibleCompare;
  }
  const scoreCompare = right.score.total - left.score.total;
  if (Math.abs(scoreCompare) > 1e-9) {
    return scoreCompare;
  }
  const routeCompare = left.route.cost - right.route.cost;
  if (Math.abs(routeCompare) > 1e-9) {
    return routeCompare;
  }
  return left.workerId.localeCompare(right.workerId);
}

function compareCandidate(left: DispatchCandidate, right: DispatchCandidate): number {
  const chitCompare = left.chitId.localeCompare(right.chitId);
  if (chitCompare !== 0) {
    return chitCompare;
  }
  return left.workerId.localeCompare(right.workerId);
}

function compareById<T extends { id: StableId }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function uniqueSorted(values: readonly StableId[]): StableId[] {
  return [...new Set(values)].sort();
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
