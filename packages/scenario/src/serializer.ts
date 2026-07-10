import type { ScenarioDocumentV1 } from "./v1";

function sortById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeScenarioDocument(document: ScenarioDocumentV1): ScenarioDocumentV1 {
  return {
    ...document,
    layout: {
      ...document.layout,
      tiles: sortById(document.layout.tiles),
      setPieces: sortById(document.layout.setPieces),
    },
    guideway: {
      nodes: sortById(document.guideway.nodes),
      links: sortById(document.guideway.links),
      openEnds: [...document.guideway.openEnds].sort((left, right) =>
        `${left.tileId}:${left.edge}`.localeCompare(`${right.tileId}:${right.edge}`),
      ),
      incompatibleConnections: [...document.guideway.incompatibleConnections].sort((left, right) =>
        `${left.tileId}:${left.neighborTileId}:${left.edge}`.localeCompare(
          `${right.tileId}:${right.neighborTileId}:${right.edge}`,
        ),
      ),
      disconnectedComponents: sortById(document.guideway.disconnectedComponents),
      serviceAttachments: [...document.guideway.serviceAttachments].sort((left, right) =>
        `${left.stationId}:${left.serviceZoneId ?? ""}`.localeCompare(
          `${right.stationId}:${right.serviceZoneId ?? ""}`,
        ),
      ),
    },
    stations: sortById(document.stations),
    serviceZones: sortById(document.serviceZones),
    electrical: {
      nodes: sortById(document.electrical.nodes),
      branches: sortById(document.electrical.branches),
      sources: sortById(document.electrical.sources),
      loads: sortById(document.electrical.loads),
      openConnectors: [...document.electrical.openConnectors].sort((left, right) =>
        `${left.tileId}:${left.edge}`.localeCompare(`${right.tileId}:${right.edge}`),
      ),
      incompatibleConnections: [...document.electrical.incompatibleConnections].sort((left, right) =>
        `${left.tileId}:${left.neighborTileId}:${left.edge}`.localeCompare(
          `${right.tileId}:${right.neighborTileId}:${right.edge}`,
        ),
      ),
    },
    inventory: {
      vehicles: sortById(document.inventory.vehicles),
    },
    contracts: sortById(document.contracts),
    chits: sortById(document.chits),
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}

export function serializeScenarioDocument(document: ScenarioDocumentV1): string {
  return `${JSON.stringify(sortKeys(normalizeScenarioDocument(document)), null, 2)}\n`;
}
