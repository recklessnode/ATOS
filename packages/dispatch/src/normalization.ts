import type { StableId, UniversalChit } from "@atos/domain";
import type {
  CargoServiceClass,
  ChitCargoMetadata,
  DispatchChit,
  DispatchChitKind,
  PassengerServiceClass,
} from "./types";

export function normalizeDispatchChits(
  chits: readonly UniversalChit[],
  currentTime: string,
): DispatchChit[] {
  return chits
    .filter((chit) => chit.status === "unsatisfied" || chit.status === "candidate")
    .map((chit) => normalizeDispatchChit(chit, currentTime))
    .sort(compareDispatchChits);
}

export function normalizeDispatchChit(chit: UniversalChit, currentTime: string): DispatchChit {
  const kind = chit.kind as DispatchChitKind;
  return {
    ...chit,
    sourceChitId: chit.id,
    kind,
    serviceMetadata: {
      passengerClass: passengerServiceClass(kind),
      cargo: cargoMetadata(kind),
      infrastructureRequired: kind === "infrastructure",
    },
    rankScore: rankScore(chit.priority, chit.readyAt, chit.dueAt, currentTime, chit.penalties.latePerMinute),
  };
}

export function compareDispatchChits(left: DispatchChit, right: DispatchChit): number {
  const scoreCompare = right.rankScore - left.rankScore;
  if (Math.abs(scoreCompare) > 1e-9) {
    return scoreCompare;
  }
  const dueCompare = Date.parse(left.dueAt) - Date.parse(right.dueAt);
  if (dueCompare !== 0) {
    return dueCompare;
  }
  const readyCompare = Date.parse(left.readyAt) - Date.parse(right.readyAt);
  return readyCompare === 0 ? left.id.localeCompare(right.id) : readyCompare;
}

export function stableGeneratedChitId(seed: string, index: number, kind: DispatchChitKind): StableId {
  return `generated:${sanitize(seed)}:${index}:${kind}`;
}

export function requiredCapabilitiesForKind(kind: DispatchChitKind): StableId[] {
  switch (kind) {
    case "commuter-passenger":
      return ["passenger", "commuter"];
    case "express-passenger":
      return ["passenger", "express"];
    case "local-cargo":
    case "regional-cargo":
    case "long-haul-cargo":
    case "parcel-cargo":
      return ["cargo"];
    case "perishable-cargo":
      return ["cargo", "cold-chain"];
    case "hazard-cargo":
      return ["cargo", "hazard-handling"];
    case "bulk-cargo":
      return ["cargo", "bulk-handling"];
    case "maintenance-supplies":
      return ["cargo", "maintenance-supplies"];
    case "battery-support":
      return ["battery-support", "power-sharing"];
    case "maintenance":
      return ["maintenance"];
    case "infrastructure":
      return ["infrastructure"];
    case "repositioning":
      return ["repositioning"];
  }
}

export function requiredVehicleClassesForKind(kind: DispatchChitKind): StableId[] {
  switch (kind) {
    case "commuter-passenger":
      return ["commuter-passenger"];
    case "express-passenger":
      return ["express-passenger"];
    case "battery-support":
      return ["battery-support"];
    case "maintenance":
    case "maintenance-supplies":
      return ["cargo"];
    case "local-cargo":
    case "regional-cargo":
    case "long-haul-cargo":
    case "perishable-cargo":
    case "hazard-cargo":
    case "bulk-cargo":
    case "parcel-cargo":
      return ["cargo"];
    case "infrastructure":
    case "repositioning":
      return [];
  }
}

export function cargoKindForServiceClass(serviceClass: CargoServiceClass): DispatchChitKind {
  switch (serviceClass) {
    case "local":
      return "local-cargo";
    case "regional":
      return "regional-cargo";
    case "long-haul":
      return "long-haul-cargo";
    case "perishable":
      return "perishable-cargo";
    case "hazard":
      return "hazard-cargo";
    case "bulk":
      return "bulk-cargo";
    case "parcel":
      return "parcel-cargo";
    case "maintenance-supplies":
      return "maintenance-supplies";
  }
}

function passengerServiceClass(kind: DispatchChitKind): PassengerServiceClass | undefined {
  if (kind === "commuter-passenger") {
    return "commuter";
  }
  if (kind === "express-passenger") {
    return "express";
  }
  return undefined;
}

function cargoMetadata(kind: DispatchChitKind): ChitCargoMetadata | undefined {
  const serviceClass = cargoServiceClass(kind);
  if (!serviceClass) {
    return undefined;
  }
  return {
    serviceClass,
    hazardous: serviceClass === "hazard",
    perishable: serviceClass === "perishable",
  };
}

function cargoServiceClass(kind: DispatchChitKind): CargoServiceClass | undefined {
  switch (kind) {
    case "local-cargo":
      return "local";
    case "regional-cargo":
      return "regional";
    case "long-haul-cargo":
      return "long-haul";
    case "perishable-cargo":
      return "perishable";
    case "hazard-cargo":
      return "hazard";
    case "bulk-cargo":
      return "bulk";
    case "parcel-cargo":
      return "parcel";
    case "maintenance-supplies":
      return "maintenance-supplies";
    default:
      return undefined;
  }
}

function rankScore(
  priority: number,
  readyAt: string,
  dueAt: string,
  currentTime: string,
  latePenalty: number,
): number {
  const readyMinutes = Math.max(0, (Date.parse(currentTime) - Date.parse(readyAt)) / 60_000);
  const dueMinutes = Math.max(0, (Date.parse(dueAt) - Date.parse(currentTime)) / 60_000);
  const urgency = Math.max(0, 720 - dueMinutes);
  return round(priority * 100 + urgency + readyMinutes * 0.1 + latePenalty * 10);
}

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "seed";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
