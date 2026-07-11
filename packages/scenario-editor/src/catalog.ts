import { createDefaultDefinitionRegistry, EDGE_INDEXES } from "@atos/layout";
import type { EditorCatalogSetPiece, EditorCatalogTile } from "./types";

export function buildTileCatalog(): EditorCatalogTile[] {
  const registry = createDefaultDefinitionRegistry();
  return registry.listTileDefinitions().map((definition) => ({
    type: definition.type,
    version: definition.version,
    label: definition.label,
    tags: definition.tags,
    guidewayConnectors: connectorSummary(
      definition.edges
        .filter((edge) => edge.guideway?.enabled)
        .map((edge) => `${edge.edge}:${edge.guideway?.gauge}`),
    ),
    electricalConnectors: connectorSummary(
      definition.edges
        .filter((edge) => edge.electrical?.enabled)
        .map((edge) => `${edge.edge}:${edge.electrical?.voltageClass}`),
    ),
    builtInPower: [
      definition.electrical.sources.length > 0 ? `${definition.electrical.sources.length} source` : "",
      definition.electrical.loads.length > 0 ? `${definition.electrical.loads.length} loads` : "",
    ].filter(Boolean).join(" / ") || "none",
    allowedSetPieces: definition.allowedSetPieceTypes,
    constraints: definition.constraints.map((constraint) => constraint.description),
  }));
}

export function buildSetPieceCatalog(): EditorCatalogSetPiece[] {
  const registry = createDefaultDefinitionRegistry();
  return registry.listSetPieceDefinitions().map((definition) => ({
    type: definition.type,
    version: definition.version,
    label: definition.visual.label,
    category: definition.visual.category,
    tags: definition.tags,
    electricalContribution: [
      definition.electrical.sources.length > 0 ? `${definition.electrical.sources.length} source` : "",
      definition.electrical.loads.length > 0
        ? `${definition.electrical.loads.reduce((sum, load) => sum + load.requestedWatts, 0)} W load`
        : "",
    ].filter(Boolean).join(" / ") || "none",
    serviceContribution: definition.service
      ? `${definition.service.serviceZoneType}, capacity ${definition.service.capacity}`
      : "none",
    dispatchContribution: definition.dispatchCapacity
      ? `${definition.dispatchCapacity.assetSlots} slots / ${definition.dispatchCapacity.parallelJobs} jobs`
      : "none",
    constraints: definition.constraints.map((constraint) => constraint.description),
  }));
}

function connectorSummary(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : `no edges (${EDGE_INDEXES.length} closed)`;
}
