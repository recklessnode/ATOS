import type { ServiceZone, StableId, Station } from "@atos/domain";
import {
  areGuidewayConnectorsCompatible,
  type GuidewayConnector,
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
import type { TileDefinition } from "./tile-definition";

export type GuidewayNode = {
  id: StableId;
  tileId: StableId;
  localNodeId: StableId;
  coordinateKey: string;
};

export type GuidewayLink = {
  id: StableId;
  fromNodeId: StableId;
  toNodeId: StableId;
  kind: "tile-internal" | "tile-connection";
};

export type GuidewayOpenEnd = {
  tileId: StableId;
  nodeId: StableId;
  edge: EdgeIndex;
  reason: "no-adjacent-tile" | "no-facing-guideway-port";
};

export type GuidewayIncompatibleConnection = {
  tileId: StableId;
  neighborTileId: StableId;
  edge: EdgeIndex;
  reason: string;
};

export type GuidewayComponent = {
  id: StableId;
  nodeIds: StableId[];
};

export type GuidewayServiceAttachment = {
  stationId: StableId;
  serviceZoneId?: StableId;
  tileId: StableId;
  nodeId: StableId;
};

export type GuidewayExtractionResult = {
  nodes: GuidewayNode[];
  links: GuidewayLink[];
  openEnds: GuidewayOpenEnd[];
  incompatibleConnections: GuidewayIncompatibleConnection[];
  disconnectedComponents: GuidewayComponent[];
  serviceAttachments: GuidewayServiceAttachment[];
  errors: string[];
};

type GuidewayPort = {
  tile: PlacedTile;
  definition: TileDefinition;
  localEdge: EdgeIndex;
  edge: EdgeIndex;
  nodeId: StableId;
};

export type GuidewayExtractionInput = {
  tiles: readonly PlacedTile[];
  registry: DefinitionRegistry;
  stations?: readonly Station[];
  serviceZones?: readonly ServiceZone[];
};

function guidewayConnectorForEdge(
  definition: TileDefinition,
  edge: EdgeIndex,
): GuidewayConnector | undefined {
  return definition.edges.find((edgeDefinition) => edgeDefinition.edge === edge)?.guideway;
}

function stableConnectionId(leftNodeId: StableId, rightNodeId: StableId): StableId {
  const [left, right] = [leftNodeId, rightNodeId].sort();
  return `connection:${left}:${right}`;
}

function buildComponents(nodes: GuidewayNode[], links: GuidewayLink[]): GuidewayComponent[] {
  const adjacency = new Map<StableId, StableId[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const link of links) {
    adjacency.get(link.fromNodeId)?.push(link.toNodeId);
    adjacency.get(link.toNodeId)?.push(link.fromNodeId);
  }

  const visited = new Set<StableId>();
  const components: GuidewayComponent[] = [];

  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (visited.has(node.id)) {
      continue;
    }

    const stack = [node.id];
    const nodeIds: StableId[] = [];
    visited.add(node.id);

    while (stack.length > 0) {
      const current = stack.pop() as StableId;
      nodeIds.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }

    nodeIds.sort();
    components.push({ id: `component-${components.length + 1}`, nodeIds });
  }

  return components;
}

export function extractGuidewayGraph(input: GuidewayExtractionInput): GuidewayExtractionResult {
  const errors: string[] = [];
  const nodes: GuidewayNode[] = [];
  const links: GuidewayLink[] = [];
  const ports: GuidewayPort[] = [];
  const openEnds: GuidewayOpenEnd[] = [];
  const incompatibleConnections: GuidewayIncompatibleConnection[] = [];

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

    for (const localNode of definition.guideway.nodes) {
      nodes.push({
        id: `${tile.id}:${localNode.id}`,
        tileId: tile.id,
        localNodeId: localNode.id,
        coordinateKey: axialKey(tile.coordinate),
      });
    }

    for (const localLink of definition.guideway.links) {
      links.push({
        id: `${tile.id}:${localLink.id}`,
        fromNodeId: `${tile.id}:${localLink.fromNodeId}`,
        toNodeId: `${tile.id}:${localLink.toNodeId}`,
        kind: "tile-internal",
      });
    }

    for (const edgePort of definition.guideway.edgePorts) {
      ports.push({
        tile,
        definition,
        localEdge: edgePort.edge,
        edge: mapLocalEdge(edgePort.edge, tile.orientation),
        nodeId: `${tile.id}:${edgePort.nodeId}`,
      });
    }
  }

  const portsByTileAndEdge = new Map<string, GuidewayPort>();
  for (const port of ports) {
    portsByTileAndEdge.set(`${port.tile.id}:${port.edge}`, port);
  }

  for (const port of [...ports].sort((left, right) => {
    const tileCompare = left.tile.id.localeCompare(right.tile.id);
    return tileCompare === 0 ? left.edge - right.edge : tileCompare;
  })) {
    const neighborCoordinate = axialNeighbor(port.tile.coordinate, port.edge);
    const neighborTile = tileByCoordinate.get(axialKey(neighborCoordinate));
    if (!neighborTile) {
      openEnds.push({
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
      openEnds.push({
        tileId: port.tile.id,
        nodeId: port.nodeId,
        edge: port.edge,
        reason: "no-facing-guideway-port",
      });
      continue;
    }

    if (port.tile.id > neighborTile.id) {
      continue;
    }

    const compatibility = areGuidewayConnectorsCompatible(
      guidewayConnectorForEdge(port.definition, port.localEdge),
      guidewayConnectorForEdge(neighborPort.definition, neighborPort.localEdge),
    );
    if (!compatibility.compatible) {
      incompatibleConnections.push({
        tileId: port.tile.id,
        neighborTileId: neighborTile.id,
        edge: port.edge,
        reason: compatibility.reason ?? "guideway connectors are incompatible",
      });
      continue;
    }

    links.push({
      id: stableConnectionId(port.nodeId, neighborPort.nodeId),
      fromNodeId: [port.nodeId, neighborPort.nodeId].sort()[0],
      toNodeId: [port.nodeId, neighborPort.nodeId].sort()[1],
      kind: "tile-connection",
    });
  }

  const serviceAttachments: GuidewayServiceAttachment[] = [];
  for (const station of input.stations ?? []) {
    serviceAttachments.push({
      stationId: station.id,
      tileId: station.guidewayAttachment.tileId,
      nodeId: `${station.guidewayAttachment.tileId}:${station.guidewayAttachment.localGuidewayNodeId}`,
    });
  }
  for (const serviceZone of input.serviceZones ?? []) {
    serviceAttachments.push({
      stationId: serviceZone.stationId,
      serviceZoneId: serviceZone.id,
      tileId: serviceZone.guidewayAttachment.tileId,
      nodeId: `${serviceZone.guidewayAttachment.tileId}:${serviceZone.guidewayAttachment.localGuidewayNodeId}`,
    });
  }

  const sortedNodes = nodes.sort((left, right) => left.id.localeCompare(right.id));
  const sortedLinks = links.sort((left, right) => left.id.localeCompare(right.id));

  return {
    nodes: sortedNodes,
    links: sortedLinks,
    openEnds: openEnds.sort((left, right) =>
      `${left.tileId}:${left.edge}`.localeCompare(`${right.tileId}:${right.edge}`),
    ),
    incompatibleConnections: incompatibleConnections.sort((left, right) =>
      `${left.tileId}:${left.neighborTileId}:${left.edge}`.localeCompare(
        `${right.tileId}:${right.neighborTileId}:${right.edge}`,
      ),
    ),
    disconnectedComponents: buildComponents(sortedNodes, sortedLinks),
    serviceAttachments: serviceAttachments.sort((left, right) =>
      `${left.stationId}:${left.serviceZoneId ?? ""}`.localeCompare(
        `${right.stationId}:${right.serviceZoneId ?? ""}`,
      ),
    ),
    errors,
  };
}
