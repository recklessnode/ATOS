import { axialDistance, axialKey, axialNeighbor, EDGE_INDEXES, type AxialCoordinate, type PlacedTile } from "@atos/layout";
import { analyzePowerNetwork, applyPowerPreset, type PowerAnalysisResult, type PowerRecommendation } from "@atos/power";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import { compareScenarios } from "./comparison";
import { duplicateTileIdFor, tileIdFor } from "./ids";
import { cloneScenarioDocument, deriveEditorState, rebuildScenarioDocument } from "./rebuild";
import type { EditorDiagnostic, EditorPreview, EditorState, RecommendationExecution } from "./types";
import { blockingDiagnostics } from "./validation";

export function recommendationExecutionFor(
  recommendation: PowerRecommendation,
  state: EditorState,
): RecommendationExecution {
  if (recommendation.type !== "add_source" && recommendation.type !== "add_tile") {
    return {
      executable: false,
      reason: `${recommendation.type} recommendations do not include scenario-level mutation data in the current power package.`,
    };
  }

  const targetTile = targetTileForRecommendation(recommendation, state);
  if (!targetTile) {
    return {
      executable: false,
      reason: "The recommendation does not resolve to a tile-backed electrical object.",
    };
  }

  const coordinate = firstEmptyNeighbor(state.draft, targetTile.coordinate);
  if (!coordinate) {
    return {
      executable: false,
      reason: "No empty adjacent coordinate is available for a power-injection tile.",
    };
  }

  return {
    executable: true,
    command: {
      type: "tile.add",
      tileType: "power-injection-curve",
      coordinate,
      orientation: targetTile.orientation,
      id: tileIdFor("power-injection-curve", coordinate, state.draft),
      commitWarnings: true,
    },
    rationale: `Add a power-injection curve adjacent to ${targetTile.id}.`,
  };
}

export function createRecommendationPreview(state: EditorState, recommendationId: string): EditorPreview | undefined {
  const recommendation = state.derived.powerAnalysis.recommendations.find((item) => item.id === recommendationId);
  if (!recommendation) {
    return undefined;
  }

  const execution = recommendationExecutionFor(recommendation, state);
  if (!execution.executable) {
    return viewOnlyPreview(state, recommendation, execution.reason);
  }

  const previewDocument = buildPreviewDocument(state.draft, execution.command);
  const derived = deriveEditorState(previewDocument, state.powerPresetId);
  const blocking = blockingDiagnostics(derived.diagnostics);
  if (blocking.length > 0) {
    return viewOnlyPreview(state, recommendation, `Preview is not executable because it creates ${blocking.length} blocking diagnostics.`);
  }

  const comparison = compareScenarios(state.draft, state.derived.powerAnalysis, previewDocument, derived.powerAnalysis);
  const diagnostics = [
    ...derived.diagnostics,
    ...nonImprovingDiagnostics(recommendation, state.derived.powerAnalysis, derived.powerAnalysis),
  ].sort((left, right) => left.id.localeCompare(right.id));

  return {
    id: `preview:${recommendation.id}`,
    recommendationId: recommendation.id,
    label: recommendation.proposedChange,
    document: previewDocument,
    powerAnalysis: derived.powerAnalysis,
    comparison,
    diagnostics,
    executable: true,
  };
}

function buildPreviewDocument(document: ScenarioDocumentV1, command: Extract<RecommendationExecution, { executable: true }>["command"]): ScenarioDocumentV1 {
  if (command.type !== "tile.add") {
    return cloneScenarioDocument(document);
  }

  const draft = cloneScenarioDocument(document);
  const tile: PlacedTile = {
    id: command.id ?? tileIdFor(command.tileType, command.coordinate, draft),
    type: command.tileType,
    version: command.version ?? 1,
    coordinate: command.coordinate,
    orientation: command.orientation ?? 0,
  };
  draft.layout.tiles = [...draft.layout.tiles, tile];
  return rebuildScenarioDocument(draft);
}

function viewOnlyPreview(state: EditorState, recommendation: PowerRecommendation, reason: string): EditorPreview {
  return {
    id: `preview:${recommendation.id}`,
    recommendationId: recommendation.id,
    label: recommendation.proposedChange,
    document: cloneScenarioDocument(state.draft),
    powerAnalysis: state.derived.powerAnalysis,
    comparison: compareScenarios(state.draft, state.derived.powerAnalysis, state.draft, state.derived.powerAnalysis),
    diagnostics: [
      {
        id: `editor:recommendation:view-only:${recommendation.id}`,
        severity: "info",
        category: "recommendation",
        code: "view_only_recommendation",
        message: "This recommendation is advisory only.",
        remediation: reason,
        blocking: false,
        target: { kind: "recommendation", id: recommendation.id },
        affectedIds: recommendation.affectedIds,
      },
    ],
    executable: false,
    reason,
  };
}

function nonImprovingDiagnostics(
  recommendation: PowerRecommendation,
  before: PowerAnalysisResult,
  after: PowerAnalysisResult,
): EditorDiagnostic[] {
  const improvesVoltage = after.metrics.minimumNodeVoltage > before.metrics.minimumNodeVoltage + 0.01;
  const improvesUnserved = after.metrics.unservedWatts < before.metrics.unservedWatts - 0.01;
  const improvesOverload = after.metrics.worstBranchUtilization < before.metrics.worstBranchUtilization - 0.001;
  if (improvesVoltage || improvesUnserved || improvesOverload) {
    return [];
  }
  return [
    {
      id: `editor:recommendation:non-improving:${recommendation.id}`,
      severity: "warning",
      category: "recommendation",
      code: "non_improving_preview",
      message: "Preview does not improve voltage, unserved power, or branch utilization.",
      remediation: "Treat this recommendation as advisory and revise the layout before accepting it.",
      blocking: false,
      target: { kind: "recommendation", id: recommendation.id },
      affectedIds: recommendation.affectedIds,
    },
  ];
}

function targetTileForRecommendation(recommendation: PowerRecommendation, state: EditorState): PlacedTile | undefined {
  const normalized = state.derived.powerAnalysis.normalized;
  const byId = new Map(state.draft.layout.tiles.map((tile) => [tile.id, tile]));
  if (recommendation.targetKind === "tile" && recommendation.targetId) {
    return byId.get(recommendation.targetId);
  }

  const candidateIds = [recommendation.targetId, ...recommendation.affectedIds].filter((id): id is string => Boolean(id));
  for (const id of candidateIds) {
    const direct = byId.get(id);
    if (direct) {
      return direct;
    }
    const node = normalized.nodes.find((item) => item.id === id);
    if (node?.tileId) {
      return byId.get(node.tileId);
    }
    const load = normalized.loads.find((item) => item.id === id);
    if (load) {
      const loadNode = normalized.nodes.find((item) => item.id === load.nodeId);
      if (loadNode?.tileId) {
        return byId.get(loadNode.tileId);
      }
    }
    const source = normalized.sources.find((item) => item.id === id);
    if (source) {
      const sourceNode = normalized.nodes.find((item) => item.id === source.nodeId);
      if (sourceNode?.tileId) {
        return byId.get(sourceNode.tileId);
      }
    }
    const branch = normalized.branches.find((item) => item.id === id);
    if (branch) {
      const from = normalized.nodes.find((item) => item.id === branch.fromNodeId);
      const to = normalized.nodes.find((item) => item.id === branch.toNodeId);
      const tile = (from?.tileId && byId.get(from.tileId)) || (to?.tileId && byId.get(to.tileId));
      if (tile) {
        return tile;
      }
    }
  }

  const lowestNode = [...state.derived.powerAnalysis.nodes].sort((left, right) => {
    const voltageCompare = left.voltage - right.voltage;
    return Math.abs(voltageCompare) > 1e-9 ? voltageCompare : left.id.localeCompare(right.id);
  })[0];
  const normalizedNode = lowestNode ? normalized.nodes.find((node) => node.id === lowestNode.id) : undefined;
  return normalizedNode?.tileId ? byId.get(normalizedNode.tileId) : undefined;
}

function firstEmptyNeighbor(document: ScenarioDocumentV1, coordinate: AxialCoordinate): AxialCoordinate | undefined {
  const occupied = new Set(document.layout.tiles.map((tile) => axialKey(tile.coordinate)));
  for (let radius = 1; radius <= 6; radius += 1) {
    const candidates = document.layout.tiles
      .filter((tile) => axialDistance(tile.coordinate, coordinate) <= radius)
      .flatMap((tile) => EDGE_INDEXES.map((edge) => axialNeighbor(tile.coordinate, edge)))
      .filter((candidate) => !occupied.has(axialKey(candidate)))
      .sort((left, right) => {
        const distanceCompare = axialDistance(left, coordinate) - axialDistance(right, coordinate);
        return distanceCompare === 0 ? axialKey(left).localeCompare(axialKey(right)) : distanceCompare;
      });
    const candidate = candidates[0];
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

export function analyzePreviewDocument(document: ScenarioDocumentV1, state: EditorState): PowerAnalysisResult {
  const rebuilt = rebuildScenarioDocument(document);
  return analyzePowerNetwork(applyPowerPreset(rebuilt.electrical, state.powerPresetId));
}
