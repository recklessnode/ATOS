import type { ContractEndpoint, StableId } from "@atos/domain";
import {
  cargoKindForServiceClass,
  requiredCapabilitiesForKind,
  requiredVehicleClassesForKind,
  stableGeneratedChitId,
} from "./normalization";
import type { CargoServiceClass, DispatchChit, DispatchChitKind } from "./types";

export type SeededDemandOptions = {
  seed: string;
  count: number;
  currentTime: string;
  stationId: StableId;
  serviceZoneIds: readonly StableId[];
};

export function generateSeededDispatchDemand(options: SeededDemandOptions): DispatchChit[] {
  const random = seededRandom(options.seed);
  const zoneIds = [...options.serviceZoneIds].sort();
  return Array.from({ length: options.count }, (_, index): DispatchChit => {
    const kind = generatedKind(random);
    const originZone = zoneIds[Math.floor(random() * zoneIds.length)] ?? zoneIds[0];
    const destinationZone = zoneIds[Math.floor(random() * zoneIds.length)] ?? originZone;
    const id = stableGeneratedChitId(options.seed, index + 1, kind);
    const readyAt = new Date(Date.parse(options.currentTime) + index * 60_000).toISOString();
    const dueAt = new Date(Date.parse(readyAt) + (4 + Math.floor(random() * 8)) * 60_000).toISOString();
    const endpoint = (zoneId: StableId | undefined): ContractEndpoint => ({
      stationId: options.stationId,
      serviceZoneId: zoneId,
    });
    const priority = 20 + Math.floor(random() * 80);

    return {
      id,
      sourceChitId: id,
      contractId: `generated-contract:${id}`,
      kind,
      status: "unsatisfied",
      origin: endpoint(originZone),
      destination: endpoint(destinationZone),
      readyAt,
      dueAt,
      priority,
      quantity: quantityForKind(kind, random),
      requirements: {
        requiredVehicleClasses: requiredVehicleClassesForKind(kind),
        requiredCapabilities: requiredCapabilitiesForKind(kind),
        stopSensitivity: kind === "express-passenger" ? "express" : kind === "battery-support" ? "direct" : "normal",
      },
      penalties: {
        waitPerMinute: kind === "express-passenger" ? 2 : 1,
        latePerMinute: kind === "express-passenger" ? 8 : 4,
        transfer: kind === "express-passenger" ? 5 : 2,
        handling: kind.includes("cargo") ? 3 : 0,
      },
      serviceMetadata: {
        passengerClass: kind === "commuter-passenger" ? "commuter" : kind === "express-passenger" ? "express" : undefined,
        cargo: cargoMetadataForKind(kind),
        infrastructureRequired: kind === "infrastructure",
      },
      rankScore: priority * 100,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function generatedKind(random: () => number): DispatchChitKind {
  const roll = random();
  if (roll < 0.24) {
    return "commuter-passenger";
  }
  if (roll < 0.38) {
    return "express-passenger";
  }
  if (roll < 0.82) {
    const cargoClasses: CargoServiceClass[] = ["local", "regional", "parcel", "bulk"];
    return cargoKindForServiceClass(cargoClasses[Math.floor(random() * cargoClasses.length)] ?? "local");
  }
  return "battery-support";
}

function quantityForKind(kind: DispatchChitKind, random: () => number): DispatchChit["quantity"] {
  if (kind === "commuter-passenger") {
    return { passengers: 2 + Math.floor(random() * 6) };
  }
  if (kind === "express-passenger") {
    return { passengers: 1 + Math.floor(random() * 3) };
  }
  if (kind === "battery-support") {
    return { energyWh: 80 + Math.floor(random() * 100) };
  }
  return {
    massKg: 2 + Math.floor(random() * 10),
    volumeLiters: 10 + Math.floor(random() * 60),
  };
}

function cargoMetadataForKind(kind: DispatchChitKind): DispatchChit["serviceMetadata"]["cargo"] {
  if (!kind.includes("cargo") && kind !== "maintenance-supplies") {
    return undefined;
  }
  if (kind === "bulk-cargo") {
    return { serviceClass: "bulk", hazardous: false, perishable: false };
  }
  if (kind === "parcel-cargo") {
    return { serviceClass: "parcel", hazardous: false, perishable: false };
  }
  if (kind === "regional-cargo") {
    return { serviceClass: "regional", hazardous: false, perishable: false };
  }
  if (kind === "long-haul-cargo") {
    return { serviceClass: "long-haul", hazardous: false, perishable: false };
  }
  if (kind === "perishable-cargo") {
    return { serviceClass: "perishable", hazardous: false, perishable: true };
  }
  if (kind === "hazard-cargo") {
    return { serviceClass: "hazard", hazardous: true, perishable: false };
  }
  if (kind === "maintenance-supplies") {
    return { serviceClass: "maintenance-supplies", hazardous: false, perishable: false };
  }
  return { serviceClass: "local", hazardous: false, perishable: false };
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
