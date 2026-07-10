import {
  areElectricalConnectorsCompatible,
  type ElectricalConnector,
} from "./connectors";
import {
  axialKey,
  axialNeighbor,
  detectDuplicateTileOccupancy,
  mapLocalEdge,
  oppositeEdge,
  type EdgeIndex,
  type PlacedTile,
} from "./hex";
import type { DefinitionRegistry } from "./registry";
import type { SetPieceInstance, TileDefinition } from "./tile-definition";

export type ElectricalNode = {
  id: string;
  tileId: string;
  localNodeId: string;
};

export type ElectricalBranch = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  resistanceOhms: number;
  currentLimitAmps: number;
  enabled: boolean;
  kind: "tile-internal" | "tile-connection";
};

export type ElectricalSource = {
  id: string;
  nodeId: string;
  nominalVoltage: number;
  maximumWatts: number;
};

export type ElectricalLoad = {
  id: string;
  nodeId: string;
  requestedWatts: number;
  minimumVoltage: number;
  loadClass: string;
  sheddingPriority: number;
};

export type ElectricalOpenConnector = {
  tileId: string;
  nodeId: string;
  edge: EdgeIndex;
  reason: "no-adjacent-tile" | "no-facing-electrical-port";
};

export type ElectricalIncompatibleConnection = {
  tileId: string;
  neighborTileId: string;
  edge: EdgeIndex;
  reason: string;
};

export type ElectricalExtractionResult = {
  nodes: ElectricalNode[];
  branches: ElectricalBranch[];
  sources: ElectricalSource[];
  loads: ElectricalLoad[];
  openConnectors: ElectricalOpenConnector[];
  incompatibleConnections: ElectricalIncompatibleConnection[];
  errors: string[];
};

type ElectricalPort = {
  tile: PlacedTile;
  definition: TileDefinition;
  localEdge: EdgeIndex;
  edge: EdgeIndex;
  nodeId: string;
};

export type ElectricalExtractionInput = {
  tiles: readonly PlacedTile[];
  setPieces?: readonly SetPieceInstance[];
  registry: DefinitionRegistry;
};

function electricalConnectorForEdge(
  definition: TileDefinition,
  edge: EdgeIndex,
): ElectricalConnector | undefined {
  return definition.edges.find((edgeDefinition) => edgeDefinition.edge === edge)?.electrical;
}

function stableConnectionId(leftNodeId: string, rightNodeId: string): string {
  const [left, right] = [leftNodeId, rightNodeId].sort();
  return `electrical-connection:${left}:${right}`;
}

export function extractElectricalGraph(input: ElectricalExtractionInput): ElectricalExtractionResult {
  const errors: string[] = [];
  const nodes: ElectricalNode[] = [];
  const branches: ElectricalBranch[] = [];
  const sources: ElectricalSource[] = [];
  const loads: ElectricalLoad[] = [];
  const ports: ElectricalPort[] = [];
  const openConnectors: ElectricalOpenConnector[] = [];
  const incompatibleConnections: ElectricalIncompatibleConnection[] = [];

  for (const duplicate of detectDuplicateTileOccupancy(input.tiles)) {
    errors.push(`Duplicate tile occupancy at ${duplicate.key}: ${duplicate.tileIds.join(", ")}`);
  }

  const sortedTiles = [...input.tiles].sort((left, right) => left.id.localeCompare(right.id));
  const tileByCoordinate = new Map<string, PlacedTile>();

  for (const tile of sortedTiles) {
    tileByCoordinate.set(axialKey(tile.coordinate), tile);
  }

  for (const tile of sortedTiles) {
    const definition = input.registry.getTileDefinition(tile.type, tile.version);
    if (!definition) {
      errors.push(`Missing tile definition ${tile.type}@${tile.version} for ${tile.id}`);
      continue;
    }

    for (const localNode of definition.electrical.nodes) {
      nodes.push({ id: `${tile.id}:${localNode.id}`, tileId: tile.id, localNodeId: localNode.id });
    }
    for (const conductor of definition.electrical.conductors) {
      branches.push({
        id: `${tile.id}:${conductor.id}`,
        fromNodeId: `${tile.id}:${conductor.fromNodeId}`,
        toNodeId: `${tile.id}:${conductor.toNodeId}`,
        resistanceOhms: conductor.resistanceOhms,
        currentLimitAmps: conductor.currentLimitAmps,
        enabled: conductor.enabled,
        kind: "tile-internal",
      });
    }
    for (const source of definition.electrical.sources) {
      sources.push({
        id: `${tile.id}:${source.id}`,
        nodeId: `${tile.id}:${source.nodeId}`,
        nominalVoltage: source.nominalVoltage,
        maximumWatts: source.maximumWatts,
      });
    }
    for (const load of definition.electrical.loads) {
      loads.push({
        id: `${tile.id}:${load.id}`,
        nodeId: `${tile.id}:${load.nodeId}`,
        requestedWatts: load.requestedWatts,
        minimumVoltage: load.minimumVoltage,
        loadClass: load.loadClass,
        sheddingPriority: load.sheddingPriority,
      });
    }
    for (const edgePort of definition.electrical.edgePorts) {
      ports.push({
        tile,
        definition,
        localEdge: edgePort.edge,
        edge: mapLocalEdge(edgePort.edge, tile.orientation),
        nodeId: `${tile.id}:${edgePort.nodeId}`,
      });
    }
  }

  for (const setPiece of [...(input.setPieces ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const definition = input.registry.getSetPieceDefinition(setPiece.type, setPiece.version);
    if (!definition) {
      errors.push(`Missing set-piece definition ${setPiece.type}@${setPiece.version} for ${setPiece.id}`);
      continue;
    }
    const nodeId = `${setPiece.tileId}:${setPiece.localElectricalNodeId ?? "bus-a"}`;
    for (const load of definition.electrical.loads) {
      loads.push({
        id: `${setPiece.id}:${load.id}`,
        nodeId,
        requestedWatts: load.requestedWatts,
        minimumVoltage: load.minimumVoltage,
        loadClass: load.loadClass,
        sheddingPriority: load.sheddingPriority,
      });
    }
    for (const source of definition.electrical.sources) {
      sources.push({
        id: `${setPiece.id}:${source.id}`,
        nodeId,
        nominalVoltage: source.nominalVoltage,
        maximumWatts: source.maximumWatts,
      });
    }
  }

  const portsByTileAndEdge = new Map<string, ElectricalPort>();
  for (const port of ports) {
    portsByTileAndEdge.set(`${port.tile.id}:${port.edge}`, port);
  }

  for (const port of [...ports].sort((left, right) => {
    const tileCompare = left.tile.id.localeCompare(right.tile.id);
    return tileCompare === 0 ? left.edge - right.edge : tileCompare;
  })) {
    const neighborTile = tileByCoordinate.get(axialKey(axialNeighbor(port.tile.coordinate, port.edge)));
    if (!neighborTile) {
      openConnectors.push({
        tileId: port.tile.id,
        nodeId: port.nodeId,
        edge: port.edge,
        reason: "no-adjacent-tile",
      });
      continue;
    }

    const neighborPort = portsByTileAndEdge.get(
      `${neighborTile.id}:${oppositeEdge(port.edge)}`,
    );
    if (!neighborPort) {
      openConnectors.push({
        tileId: port.tile.id,
        nodeId: port.nodeId,
        edge: port.edge,
        reason: "no-facing-electrical-port",
      });
      continue;
    }

    if (port.tile.id > neighborTile.id) {
      continue;
    }

    const compatibility = areElectricalConnectorsCompatible(
      electricalConnectorForEdge(port.definition, port.localEdge),
      electricalConnectorForEdge(neighborPort.definition, neighborPort.localEdge),
    );
    if (!compatibility.compatible) {
      incompatibleConnections.push({
        tileId: port.tile.id,
        neighborTileId: neighborTile.id,
        edge: port.edge,
        reason: compatibility.reason ?? "electrical connectors are incompatible",
      });
      continue;
    }

    branches.push({
      id: stableConnectionId(port.nodeId, neighborPort.nodeId),
      fromNodeId: [port.nodeId, neighborPort.nodeId].sort()[0],
      toNodeId: [port.nodeId, neighborPort.nodeId].sort()[1],
      resistanceOhms: 0.02,
      currentLimitAmps: 4,
      enabled: true,
      kind: "tile-connection",
    });
  }

  return {
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    branches: branches.sort((left, right) => left.id.localeCompare(right.id)),
    sources: sources.sort((left, right) => left.id.localeCompare(right.id)),
    loads: loads.sort((left, right) => left.id.localeCompare(right.id)),
    openConnectors: openConnectors.sort((left, right) =>
      `${left.tileId}:${left.edge}`.localeCompare(`${right.tileId}:${right.edge}`),
    ),
    incompatibleConnections: incompatibleConnections.sort((left, right) =>
      `${left.tileId}:${left.neighborTileId}:${left.edge}`.localeCompare(
        `${right.tileId}:${right.neighborTileId}:${right.edge}`,
      ),
    ),
    errors,
  };
}
