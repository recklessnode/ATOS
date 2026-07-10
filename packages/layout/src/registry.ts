import type { StableId } from "@atos/domain";
import type { TileEdgeDefinition } from "./connectors";
import type {
  ElectricalContributionDefinition,
  GuidewayTopologyDefinition,
  LoadClass,
  SetPieceDefinition,
  TileDefinition,
} from "./tile-definition";

function definitionKey(type: StableId, version: number): string {
  return `${type}@${version}`;
}

export class DefinitionRegistry {
  private readonly tileDefinitions = new Map<string, TileDefinition>();
  private readonly setPieceDefinitions = new Map<string, SetPieceDefinition>();

  registerTileDefinition(definition: TileDefinition): void {
    this.tileDefinitions.set(definitionKey(definition.type, definition.version), definition);
  }

  registerSetPieceDefinition(definition: SetPieceDefinition): void {
    this.setPieceDefinitions.set(definitionKey(definition.type, definition.version), definition);
  }

  getTileDefinition(type: StableId, version: number): TileDefinition | undefined {
    return this.tileDefinitions.get(definitionKey(type, version));
  }

  getSetPieceDefinition(type: StableId, version: number): SetPieceDefinition | undefined {
    return this.setPieceDefinitions.get(definitionKey(type, version));
  }
}

const BASE_GUIDEWAY: GuidewayTopologyDefinition = {
  nodes: [
    { id: "guideway-a", label: "Guideway port A" },
    { id: "guideway-b", label: "Guideway port B" },
  ],
  links: [{ id: "curve", fromNodeId: "guideway-a", toNodeId: "guideway-b" }],
  edgePorts: [
    { id: "edge-0", edge: 0, nodeId: "guideway-a" },
    { id: "edge-2", edge: 2, nodeId: "guideway-b" },
  ],
};

const BASE_ELECTRICAL: ElectricalContributionDefinition = {
  nodes: [
    { id: "bus-a", label: "Tile bus A" },
    { id: "bus-b", label: "Tile bus B" },
  ],
  conductors: [
    {
      id: "bus-link",
      fromNodeId: "bus-a",
      toNodeId: "bus-b",
      resistanceOhms: 0.08,
      currentLimitAmps: 4,
      enabled: true,
    },
  ],
  edgePorts: [
    { id: "edge-0", edge: 0, nodeId: "bus-a" },
    { id: "edge-2", edge: 2, nodeId: "bus-b" },
  ],
  sources: [],
  loads: [],
};

function baseEdges(gauge: "atos-standard" | "maintenance" = "atos-standard"): TileEdgeDefinition[] {
  return [0, 1, 2, 3, 4, 5].map((edge) => ({
    edge,
    guideway:
      edge === 0 || edge === 2
        ? { kind: "guideway", gauge, enabled: true }
        : undefined,
    electrical:
      edge === 0 || edge === 2
        ? { kind: "electrical", voltageClass: "low-voltage-dc", enabled: true }
        : undefined,
  })) as TileEdgeDefinition[];
}

function curveTile(
  type: StableId,
  label: string,
  tags: string[],
  options: {
    source?: boolean;
    load?: { id: StableId; watts: number; loadClass: LoadClass; priority: number };
    allowedSetPieces?: StableId[];
    gauge?: "atos-standard" | "maintenance";
  } = {},
): TileDefinition {
  return {
    type,
    version: 1,
    label,
    tags: ["guideway", "curve", ...tags],
    edges: baseEdges(options.gauge),
    guideway: BASE_GUIDEWAY,
    electrical: {
      ...BASE_ELECTRICAL,
      sources: options.source
        ? [{ id: "source", nodeId: "bus-a", nominalVoltage: 24, maximumWatts: 100 }]
        : [],
      loads: options.load
        ? [
            {
              id: options.load.id,
              nodeId: "bus-a",
              requestedWatts: options.load.watts,
              minimumVoltage: 20,
              loadClass: options.load.loadClass,
              sheddingPriority: options.load.priority,
            },
          ]
        : [],
    },
    allowedSetPieceTypes: options.allowedSetPieces ?? [],
    builtInSetPieceTypes: [],
    constraints: [{ type: "none", description: "No additional placement constraint." }],
  };
}

function setPieceLoad(
  id: StableId,
  watts: number,
  loadClass: LoadClass,
  priority: number,
) {
  return {
    id,
    nodeId: "bus-a",
    requestedWatts: watts,
    minimumVoltage: 20,
    loadClass,
    sheddingPriority: priority,
  };
}

export function createDefaultDefinitionRegistry(): DefinitionRegistry {
  const registry = new DefinitionRegistry();

  registry.registerTileDefinition(
    curveTile("power-injection-curve", "Power injection curve", ["power"], {
      source: true,
      allowedSetPieces: ["yard-lighting"],
    }),
  );
  registry.registerTileDefinition(
    curveTile("passenger-station-curve", "Passenger station curve", ["station"], {
      allowedSetPieces: ["station-control", "passenger-platform"],
    }),
  );
  registry.registerTileDefinition(
    curveTile("cargo-depot-curve", "Cargo depot curve", ["cargo"], {
      allowedSetPieces: ["cargo-depot"],
    }),
  );
  registry.registerTileDefinition(
    curveTile("charging-siding-curve", "Charging siding curve", ["energy"], {
      allowedSetPieces: ["charging-siding"],
    }),
  );
  registry.registerTileDefinition(
    curveTile("utility-curve", "Utility guideway curve", ["utility"], {
      allowedSetPieces: ["yard-lighting"],
    }),
  );
  registry.registerTileDefinition(
    curveTile("maintenance-gauge-curve", "Maintenance gauge curve", ["test"], {
      gauge: "maintenance",
    }),
  );

  registry.registerSetPieceDefinition({
    type: "station-control",
    version: 1,
    visual: { label: "Station control cabinet", category: "station" },
    tags: ["station", "control"],
    electrical: { loads: [setPieceLoad("control-load", 6, "control", 1)], sources: [] },
    dispatchCapacity: { assetSlots: 2, parallelJobs: 1 },
    constraints: [{ type: "requires-station", description: "Requires a station tile." }],
  });
  registry.registerSetPieceDefinition({
    type: "passenger-platform",
    version: 1,
    visual: { label: "Passenger platform", category: "platform" },
    tags: ["passenger"],
    electrical: { loads: [setPieceLoad("platform-lighting", 8, "passenger", 10)], sources: [] },
    service: { serviceZoneType: "passenger-platform", capacity: 12 },
    dispatchCapacity: { assetSlots: 2, parallelJobs: 1 },
    constraints: [{ type: "requires-station", description: "Requires station service." }],
  });
  registry.registerSetPieceDefinition({
    type: "cargo-depot",
    version: 1,
    visual: { label: "Cargo depot", category: "depot" },
    tags: ["cargo"],
    electrical: { loads: [setPieceLoad("cargo-handling", 12, "cargo", 20)], sources: [] },
    service: { serviceZoneType: "cargo-depot", capacity: 4 },
    dispatchCapacity: { assetSlots: 2, parallelJobs: 1 },
    constraints: [{ type: "requires-station", description: "Requires station service." }],
  });
  registry.registerSetPieceDefinition({
    type: "charging-siding",
    version: 1,
    visual: { label: "Charging siding", category: "energy" },
    tags: ["charging", "battery"],
    electrical: { loads: [setPieceLoad("charger", 20, "charging", 5)], sources: [] },
    service: { serviceZoneType: "charging-siding", capacity: 1 },
    dispatchCapacity: { assetSlots: 1, parallelJobs: 1 },
    constraints: [{ type: "requires-adjacent-guideway", description: "Requires guideway access." }],
  });
  registry.registerSetPieceDefinition({
    type: "yard-lighting",
    version: 1,
    visual: { label: "Yard lighting", category: "utility" },
    tags: ["effects", "lighting"],
    electrical: { loads: [setPieceLoad("lighting", 4, "effects", 50)], sources: [] },
    constraints: [{ type: "none", description: "May be placed on any utility tile." }],
  });

  return registry;
}
