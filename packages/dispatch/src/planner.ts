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
  worker: DispatchWorker;
  supportWorkers: DispatchWorker[];
};

type ReservationCapacityIndex = {
  used: Map<StableId, number>;
  capacity: Map<StableId, number>;
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

export function planDispatch(input: DispatchPlannerInput): DispatchPlannerResult {
  const scenario = input.scenario;
  const generatedAt = input.options?.currentTime ?? scenario.simulation.currentTime;
  const powerAnalysis = input.powerAnalysis ?? analyzePowerNetwork(input.electrical);
  const normalizedChits = [
    ...normalizeDispatchChits(scenario.chits, generatedAt),
    ...(input.options?.generatedChits ?? []),
  ].sort((left, right) => {
    const scoreCompare = right.rankScore - left.rankScore;
    return scoreCompare === 0 ? left.id.localeCompare(right.id) : scoreCompare;
  });
  const assets = buildDispatchAssets(scenario);
  const workers = buildDispatchWorkers(assets);
  const powerGate = evaluatePowerLaunchGate(powerAnalysis, assets);
  const assetIndex = assetById(assets);
  const vehicleWorkers = workers.filter((worker) => worker.source === "vehicle").sort(compareById);
  const capacityIndex = reservationCapacityIndex(scenario);

  const allCandidates: DispatchCandidate[] = [];
  const transientSuperWorkers: TransientSuperWorker[] = [];
  const reservations: DispatchReservation[] = [];
  const missionPlans: MissionPlan[] = [];
  const deficiencyGates: DeficiencyGate[] = [];

  for (const chit of normalizedChits) {
    const evaluations = vehicleWorkers
      .map((worker) => evaluateCandidate({
        chit,
        worker,
        workers,
        assets,
        powerGate,
        input,
      }))
      .sort(compareCandidateEvaluations);

    allCandidates.push(...evaluations.map(stripCandidateRuntime));
    const eligible = evaluations.filter((candidate) => candidate.match.eligible && candidate.route.reachable);
    const launchable = eligible.filter((candidate) => candidate.launchGate.status !== "blocked");
    const chosen = launchable.find((candidate) =>
      reservationsAvailable(candidate, chit, scenario, capacityIndex)
    );

    if (!chosen) {
      deficiencyGates.push(...deficienciesForUnplannedChit(chit, evaluations));
      continue;
    }

    reserveCandidate(chosen, chit, scenario, generatedAt, reservations, capacityIndex);
    const superWorker = buildTransientSuperWorker(chit, chosen);
    transientSuperWorkers.push(superWorker);
    const missionPlan = buildMissionPlan(chit, chosen, superWorker, generatedAt, reservations);
    missionPlans.push(missionPlan);

    if (chosen.launchGate.status === "delayed") {
      deficiencyGates.push(powerDeficiencyForChit(chit, chosen.launchGate, "power_delayed", "warning"));
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

function evaluateCandidate(input: {
  chit: DispatchChit;
  worker: DispatchWorker;
  workers: readonly DispatchWorker[];
  assets: readonly DispatchAsset[];
  powerGate: PowerLaunchGate;
  input: DispatchPlannerInput;
}): CandidateEvaluation {
  const supportWorkers = supportWorkersForChit(input.chit, input.workers);
  const match = matchWorkerToChit(input.chit, input.worker, supportWorkers, input.assets);
  const route = routeBetweenEndpoints(input.input.guideway, input.chit.origin, input.chit.destination);
  const score = scoreCandidate(input.chit, input.worker, supportWorkers, route, input.powerGate, match);
  const supportWorkerIds = supportWorkers.map((worker) => worker.id).sort();
  const assetIds = uniqueSorted([
    ...input.worker.assetIds,
    ...supportWorkers.flatMap((worker) => worker.assetIds),
  ]);

  return {
    chitId: input.chit.id,
    workerId: input.worker.id,
    supportWorkerIds,
    assetIds,
    match,
    route,
    launchGate: input.powerGate,
    score,
    worker: input.worker,
    supportWorkers,
  };
}

function supportWorkersForChit(
  chit: DispatchChit,
  workers: readonly DispatchWorker[],
): DispatchWorker[] {
  const zoneWorkers = supportWorkersForServiceZones(workers, [
    chit.origin.serviceZoneId,
    chit.destination.serviceZoneId,
  ]);
  const supportCapabilities = new Set(requiredCapabilitiesForKind(chit.kind));
  return zoneWorkers
    .filter((worker) =>
      worker.capabilities.some((capability) => supportCapabilities.has(capability)) ||
      worker.capabilities.includes("passenger-boarding") ||
      worker.capabilities.includes("cargo-handling") ||
      worker.capabilities.includes("charging")
    )
    .sort(compareById);
}

function matchWorkerToChit(
  chit: DispatchChit,
  worker: DispatchWorker,
  supportWorkers: readonly DispatchWorker[],
  assets: readonly DispatchAsset[],
): CapabilityMatch {
  const combinedCapabilities = new Set([
    ...worker.capabilities,
    ...supportWorkers.flatMap((supportWorker) => supportWorker.capabilities),
  ]);
  const requiredCapabilities = uniqueSorted([
    ...chit.requirements.requiredCapabilities,
    ...requiredCapabilitiesForKind(chit.kind),
  ]);
  const requiredVehicleClasses = uniqueSorted([
    ...chit.requirements.requiredVehicleClasses,
    ...requiredVehicleClassesForKind(chit.kind),
  ]);
  const forbiddenVehicleClasses = chit.requirements.forbiddenVehicleClasses ?? [];
  const missingCapabilities = requiredCapabilities.filter((capability) => !combinedCapabilities.has(capability));
  const missingVehicleClasses = requiredVehicleClasses.filter((vehicleClass) => !worker.capabilities.includes(vehicleClass));
  const forbiddenCapabilities = forbiddenVehicleClasses.filter((vehicleClass) =>
    worker.capabilities.includes(vehicleClass)
  );
  const capacityDeficits = capacityDeficitsForChit(chit, worker, assets);
  const compatibilityWarnings = compatibilityWarningsForChit(chit, supportWorkers);
  const reasons = [
    ...missingCapabilities.map((capability) => `Missing capability ${capability}`),
    ...missingVehicleClasses.map((vehicleClass) => `Missing vehicle class ${vehicleClass}`),
    ...forbiddenCapabilities.map((vehicleClass) => `Forbidden vehicle class ${vehicleClass}`),
    ...capacityDeficits,
    ...(worker.state !== "available" ? [`Worker state is ${worker.state}`] : []),
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

function compatibilityWarningsForChit(
  chit: DispatchChit,
  supportWorkers: readonly DispatchWorker[],
): string[] {
  if (chit.kind === "hazard-cargo" && !supportWorkers.some((worker) => worker.capabilities.includes("hazard-handling"))) {
    return ["Hazard cargo requires a hazard-capable depot support worker"];
  }
  if (chit.kind === "perishable-cargo" && !supportWorkers.some((worker) => worker.capabilities.includes("cold-chain"))) {
    return ["Perishable cargo requires a cold-chain support worker"];
  }
  return [];
}

function scoreCandidate(
  chit: DispatchChit,
  worker: DispatchWorker,
  supportWorkers: readonly DispatchWorker[],
  route: GuidewayRoute,
  gate: PowerLaunchGate,
  match: CapabilityMatch,
): DispatchScoreBreakdown {
  const capacityHeadroom = capacityHeadroomScore(chit, worker);
  const routeEfficiency = route.reachable ? Math.max(0, 100 - route.cost * 8) : 0;
  const powerReadiness = gate.status === "allowed" ? 100 : gate.status === "delayed" ? 45 : 0;
  const deadlineUrgency = Math.max(0, 100 - Math.max(0, Date.parse(chit.dueAt) - Date.parse(chit.readyAt)) / 60_000);
  const reservationPenalty = supportWorkers.length > 2 ? -5 : 0;
  const priority = Math.min(100, chit.priority);
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
  chit: DispatchChit,
  scenario: ScenarioDocumentV1,
  capacityIndex: ReservationCapacityIndex,
): boolean {
  return reservationResources(candidate, chit).every((resource) => {
    const capacity = capacityIndex.capacity.get(resource) ?? capacityForResource(resource, scenario);
    const used = capacityIndex.used.get(resource) ?? 0;
    return used < capacity;
  });
}

function reserveCandidate(
  candidate: CandidateEvaluation,
  chit: DispatchChit,
  scenario: ScenarioDocumentV1,
  generatedAt: string,
  reservations: DispatchReservation[],
  capacityIndex: ReservationCapacityIndex,
): void {
  const missionPlanId = missionPlanIdFor(chit, candidate);
  const startTime = startTimeFor(chit, generatedAt);
  const endTime = endTimeFor(startTime, candidate.route);
  for (const resourceId of reservationResources(candidate, chit)) {
    capacityIndex.used.set(resourceId, (capacityIndex.used.get(resourceId) ?? 0) + 1);
    capacityIndex.capacity.set(resourceId, capacityForResource(resourceId, scenario));
    reservations.push({
      id: `reservation:${missionPlanId}:${resourceId}`,
      missionPlanId,
      resourceType: reservationTypeForResource(resourceId),
      resourceId,
      startTime,
      endTime,
      chitIds: [chit.id],
    });
  }
}

function buildTransientSuperWorker(
  chit: DispatchChit,
  candidate: CandidateEvaluation,
): TransientSuperWorker {
  const supportWorkerIds = candidate.supportWorkers.map((worker) => worker.id).sort();
  return {
    id: superWorkerIdFor(chit, candidate),
    kind: "transient-super-worker",
    label: `${chit.id} consist`,
    chitIds: [chit.id],
    workerIds: [candidate.worker.id, ...supportWorkerIds].sort(),
    assetIds: [...candidate.assetIds].sort(),
    capabilities: uniqueSorted([
      ...candidate.worker.capabilities,
      ...candidate.supportWorkers.flatMap((worker) => worker.capabilities),
    ]),
    capacity: { ...candidate.worker.capacity },
    primaryWorkerId: candidate.worker.id,
    supportWorkerIds,
    formationReason: `Formed deterministically for ${chit.kind} using ${candidate.worker.id}.`,
  };
}

function buildMissionPlan(
  chit: DispatchChit,
  candidate: CandidateEvaluation,
  superWorker: TransientSuperWorker,
  generatedAt: string,
  reservations: readonly DispatchReservation[],
): MissionPlan {
  const id = missionPlanIdFor(chit, candidate);
  const startsAt = startTimeFor(chit, generatedAt);
  const endsAt = endTimeFor(startsAt, candidate.route);
  const reservationIds = reservations
    .filter((reservation) => reservation.missionPlanId === id)
    .map((reservation) => reservation.id)
    .sort();

  return {
    id,
    chitId: chit.id,
    state: candidate.launchGate.status === "delayed" ? "delayed" : "planned",
    superWorkerId: superWorker.id,
    workerIds: [...superWorker.workerIds],
    assetIds: [...superWorker.assetIds],
    route: candidate.route,
    launchGate: candidate.launchGate,
    reservationIds,
    score: candidate.score,
    startsAt,
    endsAt,
    steps: missionSteps(chit, candidate, superWorker),
  };
}

function missionSteps(
  chit: DispatchChit,
  candidate: CandidateEvaluation,
  superWorker: TransientSuperWorker,
): MissionPlanStep[] {
  return [
    {
      id: `step:${chit.id}:stage`,
      label: "Stage persistent assets",
      resourceIds: superWorker.assetIds,
    },
    {
      id: `step:${chit.id}:reserve-route`,
      label: "Reserve guideway path",
      resourceIds: candidate.route.linkIds,
    },
    {
      id: `step:${chit.id}:launch-gate`,
      label: `Power launch gate: ${candidate.launchGate.status}`,
      resourceIds: candidate.launchGate.affectedPowerIds,
    },
  ];
}

function deficienciesForUnplannedChit(
  chit: DispatchChit,
  evaluations: readonly CandidateEvaluation[],
): DeficiencyGate[] {
  if (evaluations.some((candidate) => candidate.launchGate.status === "blocked")) {
    return [powerDeficiencyForChit(chit, evaluations[0].launchGate, "power_blocked", "error")];
  }
  if (evaluations.length === 0) {
    return [deficiency({
      id: `deficiency:${chit.id}:no-candidate`,
      kind: "no_candidate",
      severity: "error",
      message: `${chit.id} has no candidate worker.`,
      action: "Add an asset with the required vehicle class and capabilities.",
      chitIds: [chit.id],
    })];
  }

  const routeFailures = evaluations.filter((candidate) => !candidate.route.reachable);
  if (routeFailures.length === evaluations.length) {
    return [deficiency({
      id: `deficiency:${chit.id}:route`,
      kind: "route_unreachable",
      severity: "error",
      message: `${chit.id} cannot reach its destination on the extracted guideway graph.`,
      action: "Add or rotate guideway tiles so the origin and destination service zones are connected.",
      chitIds: [chit.id],
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
      id: `deficiency:${chit.id}:state-of-charge`,
      kind: "state_of_charge",
      severity: "error",
      message: `${chit.id} requires more onboard state of charge than any compatible asset has available.`,
      action: "Recharge or stage a battery-support asset with enough usable state of charge.",
      chitIds: [chit.id],
      affectedIds: stateOfChargeDeficits,
    })];
  }
  const missingCapabilities = uniqueSorted(evaluations.flatMap((candidate) => candidate.match.missingCapabilities));
  if (missingCapabilities.length > 0) {
    return [deficiency({
      id: `deficiency:${chit.id}:capability`,
      kind: "missing_capability",
      severity: "error",
      message: `${chit.id} requires capabilities that no candidate super-worker can supply.`,
      action: `Add assets with capabilities: ${missingCapabilities.join(", ")}.`,
      chitIds: [chit.id],
      affectedIds: missingCapabilities,
    })];
  }
  if (capacityDeficits.length > 0) {
    return [deficiency({
      id: `deficiency:${chit.id}:capacity`,
      kind: "insufficient_capacity",
      severity: "error",
      message: `${chit.id} exceeds available worker capacity.`,
      action: "Add a larger vehicle or split the chit before dispatch planning.",
      chitIds: [chit.id],
      affectedIds: capacityDeficits,
    })];
  }

  if (evaluations.some((candidate) => candidate.match.reasons.some((reason) => reason.includes("maintenance")))) {
    return [deficiency({
      id: `deficiency:${chit.id}:maintenance`,
      kind: "maintenance_required",
      severity: "error",
      message: `${chit.id} only matched assets that are in maintenance.`,
      action: "Return a compatible asset to service or add another compatible asset.",
      chitIds: [chit.id],
      assetIds: evaluations.flatMap((candidate) => candidate.assetIds),
    })];
  }

  return [deficiency({
    id: `deficiency:${chit.id}:reservation`,
    kind: "reservation_conflict",
    severity: "warning",
    message: `${chit.id} has eligible candidates but all required discrete resources are already reserved.`,
    action: "Stage an additional compatible asset or move one mission to a later planning window.",
    chitIds: [chit.id],
    assetIds: evaluations.flatMap((candidate) => candidate.assetIds),
  })];
}

function powerDeficiencyForChit(
  chit: DispatchChit,
  gate: PowerLaunchGate,
  kind: "power_blocked" | "power_delayed",
  severity: "warning" | "error",
): DeficiencyGate {
  return deficiency({
    id: `deficiency:${chit.id}:${kind}`,
    kind,
    severity,
    message: `${chit.id} launch is ${gate.status}: ${gate.message}`,
    action: gate.supportAssetIds.length > 0
      ? `Review supporting assets ${gate.supportAssetIds.join(", ")} and clear power diagnostics.`
      : "Add power support or fix the blocking power diagnostics before dispatch.",
    chitIds: [chit.id],
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

function reservationResources(candidate: CandidateEvaluation, chit: DispatchChit): StableId[] {
  return uniqueSorted([
    ...candidate.worker.assetIds.map((assetId) => `asset:${assetId}`),
    ...candidate.route.linkIds.map((linkId) => `guideway-link:${linkId}`),
    ...(chit.origin.serviceZoneId ? [`station-zone:${chit.origin.serviceZoneId}`] : []),
    ...(chit.destination.serviceZoneId ? [`station-zone:${chit.destination.serviceZoneId}`] : []),
    `power-window:${candidate.launchGate.networkState}`,
  ]);
}

function reservationCapacityIndex(scenario: ScenarioDocumentV1): ReservationCapacityIndex {
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
  return { used: new Map(), capacity };
}

function capacityForResource(resourceId: StableId, scenario: ScenarioDocumentV1): number {
  if (resourceId.startsWith("station-zone:")) {
    return scenario.serviceZones.find((zone) => `station-zone:${zone.id}` === resourceId)?.capacity ?? 1;
  }
  if (resourceId.startsWith("power-window:")) {
    return Number.POSITIVE_INFINITY;
  }
  return 1;
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
  for (const assetId of candidate.worker.assetIds) {
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
    workerId: candidate.workerId,
    supportWorkerIds: candidate.supportWorkerIds,
    assetIds: candidate.assetIds,
    match: candidate.match,
    route: candidate.route,
    launchGate: candidate.launchGate,
    score: candidate.score,
  };
}

function missionPlanIdFor(chit: DispatchChit, candidate: CandidateEvaluation): StableId {
  return `mission:${chit.id}:${candidate.workerId}`;
}

function superWorkerIdFor(chit: DispatchChit, candidate: CandidateEvaluation): StableId {
  const support = candidate.supportWorkerIds.length > 0 ? `:${candidate.supportWorkerIds.join("+")}` : "";
  return `super:${chit.id}:${candidate.workerId}${support}`;
}

function startTimeFor(chit: DispatchChit, generatedAt: string): string {
  return new Date(Math.max(Date.parse(chit.readyAt), Date.parse(generatedAt))).toISOString();
}

function endTimeFor(startTime: string, route: GuidewayRoute): string {
  const durationSeconds = Math.max(60, Math.ceil(route.cost * 90) + 120);
  return new Date(Date.parse(startTime) + durationSeconds * 1000).toISOString();
}

function capacityHeadroomScore(chit: DispatchChit, worker: DispatchWorker): number {
  const ratios = [
    ratio(chit.quantity.passengers, worker.capacity.passengers),
    ratio(chit.quantity.massKg, worker.capacity.massKg),
    ratio(chit.quantity.volumeLiters, worker.capacity.volumeLiters),
    ratio(chit.quantity.energyWh, worker.capacity.energyWh),
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
