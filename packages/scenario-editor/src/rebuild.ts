import {
  createDefaultDefinitionRegistry,
  extractElectricalGraph,
  extractGuidewayGraph,
} from "@atos/layout";
import { analyzePowerNetwork, applyPowerPreset, type PowerPresetId } from "@atos/power";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import type { EditorDerivedState } from "./types";
import { validateEditorDraft } from "./validation";

export function cloneScenarioDocument(document: ScenarioDocumentV1): ScenarioDocumentV1 {
  return JSON.parse(JSON.stringify(document)) as ScenarioDocumentV1;
}

export function rebuildScenarioDocument(document: ScenarioDocumentV1): ScenarioDocumentV1 {
  const registry = createDefaultDefinitionRegistry();
  const guideway = extractGuidewayGraph({
    tiles: document.layout.tiles,
    registry,
    stations: document.stations,
    serviceZones: document.serviceZones,
  });
  const electrical = extractElectricalGraph({
    tiles: document.layout.tiles,
    setPieces: document.layout.setPieces,
    registry,
  });

  return {
    ...cloneScenarioDocument(document),
    guideway: {
      nodes: guideway.nodes,
      links: guideway.links,
      openEnds: guideway.openEnds,
      incompatibleConnections: guideway.incompatibleConnections,
      disconnectedComponents: guideway.disconnectedComponents,
      serviceAttachments: guideway.serviceAttachments,
    },
    electrical: {
      nodes: electrical.nodes,
      branches: electrical.branches,
      sources: electrical.sources,
      loads: electrical.loads,
      openConnectors: electrical.openConnectors,
      incompatibleConnections: electrical.incompatibleConnections,
    },
  };
}

export function deriveEditorState(document: ScenarioDocumentV1, powerPresetId: PowerPresetId): EditorDerivedState {
  const registry = createDefaultDefinitionRegistry();
  const guideway = extractGuidewayGraph({
    tiles: document.layout.tiles,
    registry,
    stations: document.stations,
    serviceZones: document.serviceZones,
  });
  const electrical = extractElectricalGraph({
    tiles: document.layout.tiles,
    setPieces: document.layout.setPieces,
    registry,
  });
  const powerAnalysis = analyzePowerNetwork(applyPowerPreset(electrical, powerPresetId));
  const diagnostics = validateEditorDraft(document, { guideway, electrical, powerAnalysis, registry });
  const validationState = diagnostics.some((diagnostic) => diagnostic.blocking)
    ? "invalid"
    : diagnostics.some((diagnostic) => diagnostic.severity === "warning")
      ? "warning"
      : "valid";

  return { guideway, electrical, powerAnalysis, diagnostics, validationState };
}
