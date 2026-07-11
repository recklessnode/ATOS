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

  listTileDefinitions(): TileDefinition[] {
    return [...this.tileDefinitions.values()].sort((left, right) => {
      const typeCompare = left.type.localeCompare(right.type);
      return typeCompare === 0 ? left.version - right.version : typeCompare;
    });
  }

  listSetPieceDefinitions(): SetPieceDefinition[] {
    return [...this.setPieceDefinitions.values()].sort((left, right) => {
      const typeCompare = left.type.localeCompare(right.type);
      return typeCompare === 0 ? left.version - right.version : typeCompare;
    });
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

function blankTile(type: StableId, label: string, tags: string[] = []): TileDefinition {
  return {
    type,
    version: 1,
    label,
    tags: ["blank", "utility", ...tags],
    edges: [0, 1, 2, 3, 4, 5].map((edge) => ({ edge })) as TileEdgeDefinition[],
    guideway: { nodes: [], links: [], edgePorts: [] },
    electrical: { nodes: [], conductors: [], edgePorts: [], sources: [], loads: [] },
    allowedSetPieceTypes: ["yard-lighting", "utility-cabinet", "scenery-building", "streetlight"],
    builtInSetPieceTypes: [],
    constraints: [{ type: "none", description: "Blank utility tile with no guideway or power bus." }],
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
      allowedSetPieces: ["yard-lighting", "local-power-module", "utility-cabinet"],
    }),
  );
  registry.registerTileDefinition(blankTile("blank-utility-tile", "Blank utility tile"));
  registry.registerTileDefinition(curveTile("straight-guideway", "Straight guideway", ["straight"]));
  registry.registerTileDefinition(curveTile("sixty-degree-curve", "60-degree curve", ["curve-60"]));
  registry.registerTileDefinition(curveTile("one-twenty-degree-curve", "120-degree curve", ["curve-120"]));
  registry.registerTileDefinition(curveTile("junction-switch-tile", "Junction / switch tile", ["junction", "switch"], {
    allowedSetPieces: ["switch-controller", "guideway-sensor"],
  }));
  registry.registerTileDefinition(curveTile("station-approach", "Station approach", ["station", "approach"], {
    allowedSetPieces: ["guideway-sensor", "switch-controller"],
  }));
  registry.registerTileDefinition(
    curveTile("passenger-station-curve", "Passenger station curve", ["station"], {
      allowedSetPieces: ["station-control", "passenger-platform"],
    }),
  );
  registry.registerTileDefinition(curveTile("maintenance-shed-tile", "Maintenance shed", ["maintenance"], {
    allowedSetPieces: ["maintenance-shed", "utility-cabinet"],
  }));
  registry.registerTileDefinition(curveTile("battery-staging-siding", "Battery staging siding", ["battery", "energy"], {
    allowedSetPieces: ["battery-rack", "charging-pad"],
  }));
  registry.registerTileDefinition(blankTile("residential-city-block", "Residential / city block", ["residential", "city"]));
  registry.registerTileDefinition(blankTile("industrial-block", "Industrial block", ["industrial"]));
  registry.registerTileDefinition(curveTile("portal-interchange", "Portal / interchange", ["portal", "interchange"]));
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
      allowedSetPieces: ["yard-lighting", "utility-cabinet", "streetlight", "guideway-sensor"],
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
    type: "passenger-building",
    version: 1,
    visual: { label: "Passenger building", category: "station" },
    tags: ["passenger", "building"],
    electrical: { loads: [setPieceLoad("building-load", 10, "passenger", 18)], sources: [] },
    service: { serviceZoneType: "passenger-platform", capacity: 8 },
    dispatchCapacity: { assetSlots: 1, parallelJobs: 1 },
    constraints: [{ type: "requires-station", description: "Requires passenger station service." }],
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
    type: "cargo-warehouse",
    version: 1,
    visual: { label: "Cargo warehouse", category: "depot" },
    tags: ["cargo", "warehouse"],
    electrical: { loads: [setPieceLoad("warehouse-load", 14, "cargo", 22)], sources: [] },
    service: { serviceZoneType: "cargo-depot", capacity: 6 },
    dispatchCapacity: { assetSlots: 3, parallelJobs: 2 },
    constraints: [{ type: "requires-station", description: "Requires cargo service access." }],
  });
  registry.registerSetPieceDefinition({
    type: "forklift-zone",
    version: 1,
    visual: { label: "Forklift zone", category: "depot" },
    tags: ["cargo", "handling"],
    electrical: { loads: [setPieceLoad("forklift-load", 9, "cargo", 24)], sources: [] },
    service: { serviceZoneType: "cargo-depot", capacity: 3 },
    dispatchCapacity: { assetSlots: 2, parallelJobs: 1 },
    constraints: [{ type: "requires-station", description: "Requires cargo service access." }],
  });
  registry.registerSetPieceDefinition({
    type: "gantry-crane",
    version: 1,
    visual: { label: "Gantry crane", category: "depot" },
    tags: ["cargo", "crane"],
    electrical: { loads: [setPieceLoad("crane-load", 18, "cargo", 16)], sources: [] },
    service: { serviceZoneType: "cargo-depot", capacity: 2 },
    dispatchCapacity: { assetSlots: 1, parallelJobs: 1 },
    constraints: [{ type: "requires-station", description: "Requires cargo service access." }],
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
    type: "maintenance-shed",
    version: 1,
    visual: { label: "Maintenance shed", category: "station" },
    tags: ["maintenance"],
    electrical: { loads: [setPieceLoad("maintenance-load", 12, "control", 12)], sources: [] },
    service: { serviceZoneType: "maintenance", capacity: 2 },
    dispatchCapacity: { assetSlots: 2, parallelJobs: 1 },
    constraints: [{ type: "requires-adjacent-guideway", description: "Requires guideway service access." }],
  });
  registry.registerSetPieceDefinition({
    type: "charging-pad",
    version: 1,
    visual: { label: "Charging pad", category: "energy" },
    tags: ["charging"],
    electrical: { loads: [setPieceLoad("charging-pad-load", 24, "charging", 5)], sources: [] },
    service: { serviceZoneType: "charging-siding", capacity: 1 },
    dispatchCapacity: { assetSlots: 1, parallelJobs: 1 },
    constraints: [{ type: "requires-adjacent-guideway", description: "Requires guideway access." }],
  });
  registry.registerSetPieceDefinition({
    type: "battery-rack",
    version: 1,
    visual: { label: "Battery rack", category: "energy" },
    tags: ["battery", "storage"],
    electrical: { loads: [setPieceLoad("battery-support-load", 6, "charging", 6)], sources: [] },
    service: { serviceZoneType: "charging-siding", capacity: 2 },
    dispatchCapacity: { assetSlots: 2, parallelJobs: 1 },
    constraints: [{ type: "requires-adjacent-guideway", description: "Requires charging access." }],
  });
  registry.registerSetPieceDefinition({
    type: "guideway-sensor",
    version: 1,
    visual: { label: "Guideway sensor", category: "utility" },
    tags: ["sensor", "control"],
    electrical: { loads: [setPieceLoad("sensor-load", 2, "control", 2)], sources: [] },
    constraints: [{ type: "requires-adjacent-guideway", description: "Requires guideway visibility." }],
  });
  registry.registerSetPieceDefinition({
    type: "switch-controller",
    version: 1,
    visual: { label: "Switch controller", category: "utility" },
    tags: ["switch", "control"],
    electrical: { loads: [setPieceLoad("switch-load", 3, "control", 1)], sources: [] },
    constraints: [{ type: "requires-adjacent-guideway", description: "Requires switch guideway access." }],
  });
  registry.registerSetPieceDefinition({
    type: "utility-cabinet",
    version: 1,
    visual: { label: "Utility cabinet", category: "utility" },
    tags: ["utility", "control"],
    electrical: { loads: [setPieceLoad("utility-load", 4, "control", 8)], sources: [] },
    constraints: [{ type: "none", description: "May be placed on utility tiles." }],
  });
  registry.registerSetPieceDefinition({
    type: "scenery-building",
    version: 1,
    visual: { label: "Scenery building", category: "scenery" },
    tags: ["scenery", "building"],
    electrical: { loads: [setPieceLoad("scenery-load", 5, "effects", 60)], sources: [] },
    constraints: [{ type: "none", description: "Noncritical scenery load." }],
  });
  registry.registerSetPieceDefinition({
    type: "streetlight",
    version: 1,
    visual: { label: "Streetlight", category: "scenery" },
    tags: ["lighting", "effects"],
    electrical: { loads: [setPieceLoad("streetlight-load", 2, "effects", 70)], sources: [] },
    constraints: [{ type: "none", description: "Decorative lighting load." }],
  });
  registry.registerSetPieceDefinition({
    type: "local-power-module",
    version: 1,
    visual: { label: "Local power injection module", category: "energy" },
    tags: ["power", "source"],
    electrical: { loads: [], sources: [{ id: "local-source", nodeId: "bus-a", nominalVoltage: 24, maximumWatts: 60 }] },
    constraints: [{ type: "none", description: "Adds local 24 V source capacity." }],
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
