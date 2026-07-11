import {
  axialKey,
  createDefaultDefinitionRegistry,
  detectDuplicateTileOccupancy,
  type ElectricalExtractionResult,
  type GuidewayExtractionResult,
  type DefinitionRegistry,
} from "@atos/layout";
import type { PowerAnalysisResult } from "@atos/power";
import { validateScenarioDocumentV1, type ScenarioDocumentV1 } from "@atos/scenario";
import type { EditorDiagnostic } from "./types";

export type EditorValidationContext = {
  guideway: GuidewayExtractionResult;
  electrical: ElectricalExtractionResult;
  powerAnalysis: PowerAnalysisResult;
  registry?: DefinitionRegistry;
};

export function validateEditorDraft(
  document: ScenarioDocumentV1,
  context: EditorValidationContext,
): EditorDiagnostic[] {
  const registry = context.registry ?? createDefaultDefinitionRegistry();
  const diagnostics: EditorDiagnostic[] = [];

  for (const issue of validateScenarioDocumentV1(document)) {
    diagnostics.push({
      id: `editor:schema:${issue.path}:${issue.code}`,
      severity: "error",
      category: "schema",
      code: issue.code,
      message: issue.message,
      remediation: "Import or edit a scenario that satisfies the current schema.",
      blocking: true,
      target: { kind: "scenario", id: document.scenario.id },
      affectedIds: [issue.path],
    });
  }

  for (const duplicate of detectDuplicateTileOccupancy(document.layout.tiles)) {
    diagnostics.push({
      id: `editor:placement:duplicate:${duplicate.key}`,
      severity: "error",
      category: "placement",
      code: "duplicate_tile_occupancy",
      message: `Coordinate ${duplicate.key} is occupied by ${duplicate.tileIds.join(", ")}.`,
      remediation: "Move or remove one of the overlapping tiles.",
      blocking: true,
      target: { kind: "coordinate", id: duplicate.key, coordinate: coordinateFromKey(duplicate.key) },
      affectedIds: duplicate.tileIds,
    });
  }

  for (const tile of document.layout.tiles) {
    if (!registry.getTileDefinition(tile.type, tile.version)) {
      diagnostics.push({
        id: `editor:placement:missing-tile:${tile.id}`,
        severity: "error",
        category: "placement",
        code: "missing_tile_definition",
        message: `${tile.id} references missing tile definition ${tile.type}@${tile.version}.`,
        remediation: "Choose a registered tile type/version.",
        blocking: true,
        target: { kind: "tile", id: tile.id },
        affectedIds: [tile.id],
      });
    }
    if (!Number.isInteger(tile.orientation) || tile.orientation < 0 || tile.orientation > 5) {
      diagnostics.push({
        id: `editor:placement:orientation:${tile.id}`,
        severity: "error",
        category: "placement",
        code: "invalid_orientation",
        message: `${tile.id} has invalid orientation ${tile.orientation}.`,
        remediation: "Rotate tiles in 60-degree increments normalized to 0 through 5.",
        blocking: true,
        target: { kind: "tile", id: tile.id },
        affectedIds: [tile.id],
      });
    }
  }

  const tileIds = new Set(document.layout.tiles.map((tile) => tile.id));
  for (const setPiece of document.layout.setPieces) {
    const definition = registry.getSetPieceDefinition(setPiece.type, setPiece.version);
    const host = document.layout.tiles.find((tile) => tile.id === setPiece.tileId);
    const hostDefinition = host ? registry.getTileDefinition(host.type, host.version) : undefined;
    if (!definition) {
      diagnostics.push({
        id: `editor:placement:missing-set-piece:${setPiece.id}`,
        severity: "error",
        category: "placement",
        code: "missing_set_piece_definition",
        message: `${setPiece.id} references missing set-piece definition ${setPiece.type}@${setPiece.version}.`,
        remediation: "Choose a registered set-piece type/version.",
        blocking: true,
        target: { kind: "setPiece", id: setPiece.id },
        affectedIds: [setPiece.id],
      });
    }
    if (!tileIds.has(setPiece.tileId)) {
      diagnostics.push({
        id: `editor:placement:orphan-set-piece:${setPiece.id}`,
        severity: "error",
        category: "placement",
        code: "orphaned_set_piece",
        message: `${setPiece.id} is assigned to missing tile ${setPiece.tileId}.`,
        remediation: "Move the set piece to an existing tile or remove it.",
        blocking: true,
        target: { kind: "setPiece", id: setPiece.id },
        affectedIds: [setPiece.id, setPiece.tileId],
      });
    }
    if (hostDefinition && definition && !hostDefinition.allowedSetPieceTypes.includes(setPiece.type)) {
      diagnostics.push({
        id: `editor:placement:disallowed-host:${setPiece.id}`,
        severity: "error",
        category: "placement",
        code: "disallowed_set_piece_host",
        message: `${setPiece.type} is not allowed on ${host?.type ?? setPiece.tileId}.`,
        remediation: "Move the set piece to an allowed host tile.",
        blocking: true,
        target: { kind: "setPiece", id: setPiece.id },
        affectedIds: [setPiece.id, setPiece.tileId],
      });
    }
  }

  for (const station of document.stations) {
    if (!tileIds.has(station.tileId) || !tileIds.has(station.guidewayAttachment.tileId)) {
      diagnostics.push(stationDiagnostic(station.id, "station_broken_tile_reference", "Station references a missing tile."));
    }
    for (const serviceZoneId of station.serviceZoneIds) {
      if (!document.serviceZones.some((zone) => zone.id === serviceZoneId)) {
        diagnostics.push(stationDiagnostic(station.id, "station_missing_service_zone", `Station references missing service zone ${serviceZoneId}.`));
      }
    }
  }
  for (const serviceZone of document.serviceZones) {
    if (!document.stations.some((station) => station.id === serviceZone.stationId)) {
      diagnostics.push(stationDiagnostic(serviceZone.id, "service_zone_missing_station", `Service zone references missing station ${serviceZone.stationId}.`));
    }
    if (!tileIds.has(serviceZone.guidewayAttachment.tileId)) {
      diagnostics.push(stationDiagnostic(serviceZone.id, "service_zone_missing_tile", `Service zone references missing tile ${serviceZone.guidewayAttachment.tileId}.`));
    }
  }

  for (const error of context.guideway.errors) {
    diagnostics.push(graphDiagnostic("guideway", "extraction_error", error, true));
  }
  for (const incompatible of context.guideway.incompatibleConnections) {
    diagnostics.push({
      id: `editor:guideway:incompatible:${incompatible.tileId}:${incompatible.edge}`,
      severity: "error",
      category: "guideway",
      code: "incompatible_guideway_connector",
      message: `${incompatible.tileId} edge ${incompatible.edge} is incompatible with ${incompatible.neighborTileId}: ${incompatible.reason}.`,
      remediation: "Rotate, move, or replace one of the tiles.",
      blocking: true,
      target: { kind: "tile", id: incompatible.tileId },
      affectedIds: [incompatible.tileId, incompatible.neighborTileId],
    });
  }
  for (const openEnd of context.guideway.openEnds) {
    diagnostics.push({
      id: `editor:guideway:open:${openEnd.tileId}:${openEnd.edge}`,
      severity: "warning",
      category: "guideway",
      code: "open_guideway_end",
      message: `${openEnd.tileId} edge ${openEnd.edge} has ${openEnd.reason}.`,
      remediation: "Connect another compatible tile or commit deliberately as an open end.",
      blocking: false,
      target: { kind: "guidewayNode", id: openEnd.nodeId },
      affectedIds: [openEnd.tileId, openEnd.nodeId],
    });
  }
  for (const component of context.guideway.disconnectedComponents.slice(1)) {
    diagnostics.push({
      id: `editor:guideway:component:${component.id}`,
      severity: "warning",
      category: "guideway",
      code: "disconnected_guideway_component",
      message: `${component.id} has ${component.nodeIds.length} guideway nodes disconnected from the primary component.`,
      remediation: "Add compatible connections or commit deliberately as a disconnected component.",
      blocking: false,
      target: { kind: "guidewayNode", id: component.nodeIds[0] ?? component.id },
      affectedIds: component.nodeIds,
    });
  }

  for (const error of context.electrical.errors) {
    diagnostics.push(graphDiagnostic("electrical", "extraction_error", error, true));
  }
  for (const incompatible of context.electrical.incompatibleConnections) {
    diagnostics.push({
      id: `editor:electrical:incompatible:${incompatible.tileId}:${incompatible.edge}`,
      severity: "error",
      category: "electrical",
      code: "incompatible_electrical_connector",
      message: `${incompatible.tileId} edge ${incompatible.edge} is incompatible with ${incompatible.neighborTileId}: ${incompatible.reason}.`,
      remediation: "Use compatible voltage classes or rotate one of the facing tiles.",
      blocking: true,
      target: { kind: "tile", id: incompatible.tileId },
      affectedIds: [incompatible.tileId, incompatible.neighborTileId],
    });
  }
  for (const openConnector of context.electrical.openConnectors) {
    diagnostics.push({
      id: `editor:electrical:open:${openConnector.tileId}:${openConnector.edge}`,
      severity: "warning",
      category: "electrical",
      code: "open_electrical_connector",
      message: `${openConnector.tileId} edge ${openConnector.edge} has ${openConnector.reason}.`,
      remediation: "Connect another compatible tile or commit deliberately as an open electrical end.",
      blocking: false,
      target: { kind: "electricalNode", id: openConnector.nodeId },
      affectedIds: [openConnector.tileId, openConnector.nodeId],
    });
  }

  for (const diagnostic of context.powerAnalysis.diagnostics) {
    const blocking = diagnostic.code === "load_disconnected" || diagnostic.code === "islanded" || diagnostic.code === "invalid_network";
    diagnostics.push({
      id: `editor:power:${diagnostic.id}`,
      severity: blocking ? "error" : diagnostic.severity,
      category: "power",
      code: diagnostic.code,
      message: diagnostic.message,
      remediation: blocking
        ? "Restore a valid source path before committing this draft."
        : "Inspect power recommendations or commit deliberately with this warning.",
      blocking,
      target: targetForPowerDiagnostic(diagnostic.affectedIds),
      affectedIds: diagnostic.affectedIds,
    });
  }

  return uniqueDiagnostics(diagnostics).sort((left, right) => left.id.localeCompare(right.id));
}

export function blockingDiagnostics(diagnostics: readonly EditorDiagnostic[]): EditorDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.blocking);
}

export function warningDiagnostics(diagnostics: readonly EditorDiagnostic[]): EditorDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === "warning" && !diagnostic.blocking);
}

function stationDiagnostic(id: string, code: string, message: string): EditorDiagnostic {
  return {
    id: `editor:station:${code}:${id}`,
    severity: "error",
    category: "stationService",
    code,
    message,
    remediation: "Repair station and service-zone references.",
    blocking: true,
    target: { kind: "station", id },
    affectedIds: [id],
  };
}

function graphDiagnostic(category: "guideway" | "electrical", code: string, message: string, blocking: boolean): EditorDiagnostic {
  return {
    id: `editor:${category}:${code}:${message}`,
    severity: blocking ? "error" : "warning",
    category,
    code,
    message,
    remediation: "Repair the scenario or registry input that caused extraction to fail.",
    blocking,
    affectedIds: [],
  };
}

function coordinateFromKey(key: string): { q: number; r: number } | undefined {
  const [q, r] = key.split(",").map(Number);
  return Number.isFinite(q) && Number.isFinite(r) ? { q, r } : undefined;
}

function targetForPowerDiagnostic(affectedIds: readonly string[]): EditorDiagnostic["target"] {
  const id = affectedIds[0];
  if (!id) {
    return undefined;
  }
  if (id.includes(":bus") || id.includes(":source")) {
    return { kind: "electricalNode", id };
  }
  return { kind: id.startsWith("tile-") ? "tile" : "electricalLoad", id };
}

function uniqueDiagnostics(values: readonly EditorDiagnostic[]): EditorDiagnostic[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function coordinateOccupied(document: ScenarioDocumentV1, coordinate: { q: number; r: number }, exceptTileId?: string): boolean {
  const key = axialKey(coordinate);
  return document.layout.tiles.some((tile) => tile.id !== exceptTileId && axialKey(tile.coordinate) === key);
}
