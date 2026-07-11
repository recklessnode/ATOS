import {
  axialKey,
  axialNeighbor,
  createDefaultDefinitionRegistry,
  EDGE_INDEXES,
  normalizeOrientation,
  type AxialCoordinate,
  type DefinitionRegistry,
  type PlacedTile,
  type SetPieceInstance,
} from "@atos/layout";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import { createRecommendationPreview } from "./recommendation-preview";
import { createEditorHistory, pushRedoSnapshot, pushUndoSnapshot, snapshotFromState } from "./history";
import {
  duplicateSetPieceIdFor,
  duplicateTileIdFor,
  setPieceIdFor,
  tileIdFor,
} from "./ids";
import { cloneScenarioDocument, deriveEditorState, rebuildScenarioDocument } from "./rebuild";
import { stateFromSnapshot } from "./reducer";
import type {
  EditorCommand,
  EditorCommandFailure,
  EditorCommandResult,
  EditorDiagnostic,
  EditorEvent,
  EditorSelection,
  EditorState,
} from "./types";
import { blockingDiagnostics, coordinateOccupied, warningDiagnostics } from "./validation";

export function applyEditorCommand(state: EditorState, command: EditorCommand): EditorCommandResult {
  switch (command.type) {
    case "tile.add":
      return commitCandidate(state, addTile(state, command), {
        selection: { kind: "coordinate", id: axialKey(command.coordinate), coordinate: command.coordinate },
        commitWarnings: command.commitWarnings,
        event: { id: "tile.add", message: `Added ${command.tileType}.` },
      });
    case "tile.move":
      return commitCandidate(state, moveTile(state, command.tileId, command.coordinate), {
        selection: { kind: "tile", id: command.tileId },
        commitWarnings: command.commitWarnings,
        event: { id: "tile.move", message: `Moved ${command.tileId}.`, target: { kind: "tile", id: command.tileId } },
      });
    case "tile.rotate":
      return commitCandidate(state, rotateTile(state, command.tileId, command.steps), {
        selection: { kind: "tile", id: command.tileId },
        commitWarnings: command.commitWarnings,
        event: { id: "tile.rotate", message: `Rotated ${command.tileId}.`, target: { kind: "tile", id: command.tileId } },
      });
    case "tile.duplicate":
      return duplicateTile(state, command);
    case "tile.remove":
      return commitCandidate(state, removeTile(state, command.tileId), {
        selection: null,
        commitWarnings: command.commitWarnings,
        event: { id: "tile.remove", message: `Removed ${command.tileId}.` },
      });
    case "setPiece.add":
      return commitCandidate(state, addSetPiece(state, command), {
        selection: { kind: "setPiece", id: command.id ?? setPieceIdFor(command.setPieceType, command.tileId, state.draft) },
        commitWarnings: command.commitWarnings,
        event: { id: "setPiece.add", message: `Added ${command.setPieceType}.` },
      });
    case "setPiece.move":
    case "setPiece.reassignHost":
      return commitCandidate(state, moveSetPiece(state, command.setPieceId, command.tileId, command.localGuidewayNodeId, command.localElectricalNodeId), {
        selection: { kind: "setPiece", id: command.setPieceId },
        commitWarnings: command.commitWarnings,
        event: { id: "setPiece.move", message: `Moved ${command.setPieceId}.`, target: { kind: "setPiece", id: command.setPieceId } },
      });
    case "setPiece.rotate":
      return fail("set_piece_rotation_unsupported", `${command.setPieceId} cannot be rotated because set-piece orientation is not part of schema v1.`, [], {
        kind: "setPiece",
        id: command.setPieceId,
      });
    case "setPiece.duplicate":
      return duplicateSetPiece(state, command);
    case "setPiece.remove":
      return commitCandidate(state, removeSetPiece(state, command.setPieceId), {
        selection: null,
        commitWarnings: command.commitWarnings,
        event: { id: "setPiece.remove", message: `Removed ${command.setPieceId}.` },
      });
    case "scenario.updateMetadata":
      return commitCandidate(state, updateMetadata(state, command), {
        selection: { kind: "scenario", id: state.draft.scenario.id },
        commitWarnings: command.commitWarnings,
        event: { id: "scenario.updateMetadata", message: "Updated scenario metadata." },
      });
    case "power.setPreset":
      return setPowerPreset(state, command.presetId);
    case "powerRecommendation.preview":
      return previewRecommendation(state, command.recommendationId);
    case "powerRecommendation.acceptPreview":
      return acceptPreview(state);
    case "powerRecommendation.rejectPreview":
      return {
        ok: true,
        state: { ...state, preview: undefined },
        event: { id: "powerRecommendation.rejectPreview", message: "Rejected recommendation preview." },
      };
    case "import.replaceDraft":
      return commitCandidate(state, command.document, {
        selection: { kind: "scenario", id: command.document.scenario.id },
        commitWarnings: command.commitWarnings,
        event: { id: "import.replaceDraft", message: `Imported ${command.document.scenario.title}.` },
      });
    case "draft.resetToCanonical": {
      const draft = rebuildScenarioDocument(state.canonical);
      return {
        ok: true,
        state: {
          ...state,
          draft,
          preview: undefined,
          selection: null,
          derived: deriveEditorState(draft, state.powerPresetId),
          history: createEditorHistory(state.history.limit),
          dirty: false,
        },
        event: { id: "draft.resetToCanonical", message: "Reset draft to the canonical scenario." },
      };
    }
    case "history.undo":
      return undo(state);
    case "history.redo":
      return redo(state);
  }
}

function addTile(
  state: EditorState,
  command: Extract<EditorCommand, { type: "tile.add" }>,
): ScenarioDocumentV1 | EditorCommandFailure {
  const registry = createDefaultDefinitionRegistry();
  if (!registry.getTileDefinition(command.tileType, command.version ?? 1)) {
    return failureForDiagnostic("missing_tile_definition", `Tile definition ${command.tileType}@${command.version ?? 1} is not registered.`, {
      kind: "scenario",
      id: state.draft.scenario.id,
    });
  }
  if (coordinateOccupied(state.draft, command.coordinate)) {
    return failureForDiagnostic("duplicate_tile_occupancy", `Coordinate ${axialKey(command.coordinate)} is already occupied.`, {
      kind: "coordinate",
      id: axialKey(command.coordinate),
      coordinate: command.coordinate,
    });
  }

  const draft = cloneScenarioDocument(state.draft);
  draft.layout.tiles = [
    ...draft.layout.tiles,
    {
      id: command.id ?? tileIdFor(command.tileType, command.coordinate, draft),
      type: command.tileType,
      version: command.version ?? 1,
      coordinate: command.coordinate,
      orientation: normalizeOrientation(command.orientation ?? 0),
    },
  ];
  return draft;
}

function moveTile(state: EditorState, tileId: string, coordinate: AxialCoordinate): ScenarioDocumentV1 | EditorCommandFailure {
  if (coordinateOccupied(state.draft, coordinate, tileId)) {
    return failureForDiagnostic("duplicate_tile_occupancy", `Coordinate ${axialKey(coordinate)} is already occupied.`, {
      kind: "coordinate",
      id: axialKey(coordinate),
      coordinate,
    });
  }
  return updateTile(state, tileId, (tile) => ({ ...tile, coordinate }));
}

function rotateTile(state: EditorState, tileId: string, steps: number): ScenarioDocumentV1 | EditorCommandFailure {
  return updateTile(state, tileId, (tile) => ({ ...tile, orientation: normalizeOrientation(tile.orientation + steps) }));
}

function duplicateTile(
  state: EditorState,
  command: Extract<EditorCommand, { type: "tile.duplicate" }>,
): EditorCommandResult {
  const source = state.draft.layout.tiles.find((tile) => tile.id === command.tileId);
  if (!source) {
    return fail("missing_tile", `${command.tileId} does not exist.`, [], { kind: "tile", id: command.tileId });
  }

  const coordinate = command.coordinate ?? firstEmptyNeighbor(state.draft, source.coordinate);
  if (!coordinate) {
    return fail("no_empty_coordinate", `No adjacent empty coordinate is available for ${source.id}.`, [], { kind: "tile", id: source.id });
  }
  if (coordinateOccupied(state.draft, coordinate)) {
    return fail("duplicate_tile_occupancy", `Coordinate ${axialKey(coordinate)} is already occupied.`, [], {
      kind: "coordinate",
      id: axialKey(coordinate),
      coordinate,
    });
  }

  const draft = cloneScenarioDocument(state.draft);
  const duplicateId = command.id ?? duplicateTileIdFor(source.id, draft);
  draft.layout.tiles = [...draft.layout.tiles, { ...source, id: duplicateId, coordinate }];
  return commitCandidate(state, draft, {
    selection: { kind: "tile", id: duplicateId },
    commitWarnings: command.commitWarnings,
    event: { id: "tile.duplicate", message: `Duplicated ${source.id}.`, target: { kind: "tile", id: duplicateId } },
  });
}

function removeTile(state: EditorState, tileId: string): ScenarioDocumentV1 | EditorCommandFailure {
  if (!state.draft.layout.tiles.some((tile) => tile.id === tileId)) {
    return failureForDiagnostic("missing_tile", `${tileId} does not exist.`, { kind: "tile", id: tileId });
  }
  const draft = cloneScenarioDocument(state.draft);
  draft.layout.tiles = draft.layout.tiles.filter((tile) => tile.id !== tileId);
  draft.layout.setPieces = draft.layout.setPieces.filter((setPiece) => setPiece.tileId !== tileId);
  return draft;
}

function addSetPiece(
  state: EditorState,
  command: Extract<EditorCommand, { type: "setPiece.add" }>,
): ScenarioDocumentV1 | EditorCommandFailure {
  const registry = createDefaultDefinitionRegistry();
  const definition = registry.getSetPieceDefinition(command.setPieceType, command.version ?? 1);
  if (!definition) {
    return failureForDiagnostic("missing_set_piece_definition", `Set-piece definition ${command.setPieceType}@${command.version ?? 1} is not registered.`, {
      kind: "scenario",
      id: state.draft.scenario.id,
    });
  }
  const host = state.draft.layout.tiles.find((tile) => tile.id === command.tileId);
  if (!host) {
    return failureForDiagnostic("missing_host_tile", `${command.tileId} does not exist.`, { kind: "tile", id: command.tileId });
  }
  const hostDefinition = registry.getTileDefinition(host.type, host.version);
  if (!hostDefinition?.allowedSetPieceTypes.includes(command.setPieceType)) {
    return failureForDiagnostic("disallowed_set_piece_host", `${command.setPieceType} is not allowed on ${host.type}.`, {
      kind: "tile",
      id: host.id,
    });
  }

  const draft = cloneScenarioDocument(state.draft);
  draft.layout.setPieces = [
    ...draft.layout.setPieces,
    {
      id: command.id ?? setPieceIdFor(command.setPieceType, command.tileId, draft),
      type: command.setPieceType,
      version: command.version ?? 1,
      tileId: command.tileId,
      localGuidewayNodeId: command.localGuidewayNodeId ?? hostDefinition.guideway.nodes[0]?.id,
      localElectricalNodeId: command.localElectricalNodeId ?? hostDefinition.electrical.nodes[0]?.id,
    },
  ];
  return draft;
}

function moveSetPiece(
  state: EditorState,
  setPieceId: string,
  tileId: string,
  localGuidewayNodeId?: string,
  localElectricalNodeId?: string,
): ScenarioDocumentV1 | EditorCommandFailure {
  const targetTile = state.draft.layout.tiles.find((tile) => tile.id === tileId);
  if (!targetTile) {
    return failureForDiagnostic("missing_host_tile", `${tileId} does not exist.`, { kind: "tile", id: tileId });
  }
  return updateSetPiece(state, setPieceId, (setPiece) => ({
    ...setPiece,
    tileId,
    localGuidewayNodeId: localGuidewayNodeId ?? setPiece.localGuidewayNodeId,
    localElectricalNodeId: localElectricalNodeId ?? setPiece.localElectricalNodeId,
  }));
}

function duplicateSetPiece(
  state: EditorState,
  command: Extract<EditorCommand, { type: "setPiece.duplicate" }>,
): EditorCommandResult {
  const source = state.draft.layout.setPieces.find((setPiece) => setPiece.id === command.setPieceId);
  if (!source) {
    return fail("missing_set_piece", `${command.setPieceId} does not exist.`, [], { kind: "setPiece", id: command.setPieceId });
  }
  const hostTileId = command.tileId ?? source.tileId;
  const draft = cloneScenarioDocument(state.draft);
  const duplicateId = command.id ?? duplicateSetPieceIdFor(source.id, draft);
  draft.layout.setPieces = [...draft.layout.setPieces, { ...source, id: duplicateId, tileId: hostTileId }];
  return commitCandidate(state, draft, {
    selection: { kind: "setPiece", id: duplicateId },
    commitWarnings: command.commitWarnings,
    event: { id: "setPiece.duplicate", message: `Duplicated ${source.id}.`, target: { kind: "setPiece", id: duplicateId } },
  });
}

function removeSetPiece(state: EditorState, setPieceId: string): ScenarioDocumentV1 | EditorCommandFailure {
  if (!state.draft.layout.setPieces.some((setPiece) => setPiece.id === setPieceId)) {
    return failureForDiagnostic("missing_set_piece", `${setPieceId} does not exist.`, { kind: "setPiece", id: setPieceId });
  }
  const draft = cloneScenarioDocument(state.draft);
  draft.layout.setPieces = draft.layout.setPieces.filter((setPiece) => setPiece.id !== setPieceId);
  return draft;
}

function updateMetadata(
  state: EditorState,
  command: Extract<EditorCommand, { type: "scenario.updateMetadata" }>,
): ScenarioDocumentV1 {
  const draft = cloneScenarioDocument(state.draft);
  draft.scenario = {
    ...draft.scenario,
    title: command.title ?? draft.scenario.title,
    description: command.description ?? draft.scenario.description,
  };
  draft.randomSeed = command.randomSeed ?? draft.randomSeed;
  return draft;
}

function updateTile(
  state: EditorState,
  tileId: string,
  update: (tile: PlacedTile) => PlacedTile,
): ScenarioDocumentV1 | EditorCommandFailure {
  let found = false;
  const draft = cloneScenarioDocument(state.draft);
  draft.layout.tiles = draft.layout.tiles.map((tile) => {
    if (tile.id !== tileId) {
      return tile;
    }
    found = true;
    return update(tile);
  });
  return found ? draft : failureForDiagnostic("missing_tile", `${tileId} does not exist.`, { kind: "tile", id: tileId });
}

function updateSetPiece(
  state: EditorState,
  setPieceId: string,
  update: (setPiece: SetPieceInstance) => SetPieceInstance,
): ScenarioDocumentV1 | EditorCommandFailure {
  let found = false;
  const draft = cloneScenarioDocument(state.draft);
  draft.layout.setPieces = draft.layout.setPieces.map((setPiece) => {
    if (setPiece.id !== setPieceId) {
      return setPiece;
    }
    found = true;
    return update(setPiece);
  });
  return found ? draft : failureForDiagnostic("missing_set_piece", `${setPieceId} does not exist.`, { kind: "setPiece", id: setPieceId });
}

function commitCandidate(
  state: EditorState,
  candidate: ScenarioDocumentV1 | EditorCommandFailure,
  options: {
    selection: EditorSelection;
    commitWarnings?: boolean;
    event: EditorEvent;
    pushHistory?: boolean;
    dirty?: boolean;
  },
): EditorCommandResult {
  if (isFailure(candidate)) {
    return { ok: false, failure: candidate };
  }

  const draft = rebuildScenarioDocument(candidate);
  const derived = deriveEditorState(draft, state.powerPresetId);
  const blocking = blockingDiagnostics(derived.diagnostics);
  if (blocking.length > 0) {
    return fail("blocking_diagnostics", "Edit would create blocking diagnostics.", blocking, blocking[0]?.target);
  }
  const warnings = warningDiagnostics(derived.diagnostics);
  const confirmationWarnings = warnings.filter(requiresCommitConfirmation);
  if (confirmationWarnings.length > 0 && !options.commitWarnings) {
    return fail(
      "warnings_require_confirmation",
      "Edit is valid with warnings and requires explicit confirmation.",
      confirmationWarnings,
      confirmationWarnings[0]?.target,
    );
  }

  return {
    ok: true,
    state: {
      ...state,
      draft,
      preview: undefined,
      selection: options.selection,
      derived,
      history: options.pushHistory === false ? state.history : pushUndoSnapshot(state.history, snapshotFromState(state)),
      dirty: options.dirty ?? true,
    },
    event: options.event,
  };
}

function setPowerPreset(state: EditorState, presetId: EditorState["powerPresetId"]): EditorCommandResult {
  const derived = deriveEditorState(state.draft, presetId);
  return {
    ok: true,
    state: {
      ...state,
      powerPresetId: presetId,
      preview: undefined,
      derived,
    },
    event: { id: "power.setPreset", message: `Set power preset to ${presetId}.` },
  };
}

function previewRecommendation(state: EditorState, recommendationId: string): EditorCommandResult {
  const preview = createRecommendationPreview(state, recommendationId);
  if (!preview) {
    return fail("missing_recommendation", `${recommendationId} does not exist.`, [], { kind: "recommendation", id: recommendationId });
  }
  return {
    ok: true,
    state: { ...state, preview, selection: { kind: "recommendation", id: recommendationId } },
    event: { id: "powerRecommendation.preview", message: `Previewing ${recommendationId}.`, target: { kind: "recommendation", id: recommendationId } },
  };
}

function acceptPreview(state: EditorState): EditorCommandResult {
  if (!state.preview) {
    return fail("missing_preview", "There is no active recommendation preview.", [], { kind: "scenario", id: state.draft.scenario.id });
  }
  if (!state.preview.executable) {
    return fail("view_only_recommendation", state.preview.reason ?? "Recommendation preview is view-only.", state.preview.diagnostics, {
      kind: "recommendation",
      id: state.preview.recommendationId ?? state.preview.id,
    });
  }
  return commitCandidate(state, state.preview.document, {
    selection: { kind: "recommendation", id: state.preview.recommendationId ?? state.preview.id },
    commitWarnings: true,
    event: { id: "powerRecommendation.acceptPreview", message: "Accepted recommendation preview." },
  });
}

function undo(state: EditorState): EditorCommandResult {
  const snapshot = state.history.undoStack.at(-1);
  if (!snapshot) {
    return fail("undo_unavailable", "There is no edit to undo.", [], { kind: "scenario", id: state.draft.scenario.id });
  }
  const history = {
    undoStack: state.history.undoStack.slice(0, -1),
    redoStack: pushRedoSnapshot({ ...state.history, redoStack: [] }, snapshotFromState(state)).redoStack,
    limit: state.history.limit,
  };
  return {
    ok: true,
    state: stateFromSnapshot({ state, ...snapshot, history, dirty: true }),
    event: { id: "history.undo", message: "Undid the last edit." },
  };
}

function redo(state: EditorState): EditorCommandResult {
  const snapshot = state.history.redoStack.at(-1);
  if (!snapshot) {
    return fail("redo_unavailable", "There is no edit to redo.", [], { kind: "scenario", id: state.draft.scenario.id });
  }
  const history = {
    undoStack: [...state.history.undoStack, snapshotFromState(state)].slice(-state.history.limit),
    redoStack: state.history.redoStack.slice(0, -1),
    limit: state.history.limit,
  };
  return {
    ok: true,
    state: stateFromSnapshot({ state, ...snapshot, history, dirty: true }),
    event: { id: "history.redo", message: "Redid the edit." },
  };
}

function firstEmptyNeighbor(document: ScenarioDocumentV1, coordinate: AxialCoordinate): AxialCoordinate | undefined {
  const occupied = new Set(document.layout.tiles.map((tile) => axialKey(tile.coordinate)));
  return EDGE_INDEXES.map((edge) => axialNeighbor(coordinate, edge))
    .filter((candidate) => !occupied.has(axialKey(candidate)))
    .sort((left, right) => axialKey(left).localeCompare(axialKey(right)))[0];
}

function failureForDiagnostic(code: string, message: string, target: EditorDiagnostic["target"]): EditorCommandFailure {
  const diagnostic: EditorDiagnostic = {
    id: `editor:placement:${code}:${target?.id ?? "scenario"}`,
    severity: "error",
    category: "placement",
    code,
    message,
    remediation: "Choose a different object, host, or coordinate.",
    blocking: true,
    target,
    affectedIds: target ? [target.id] : [],
  };
  return { id: `failure:${code}:${target?.id ?? "scenario"}`, code, message, diagnostics: [diagnostic], target };
}

function fail(
  code: string,
  message: string,
  diagnostics: EditorDiagnostic[],
  target?: EditorDiagnostic["target"],
): EditorCommandResult {
  return {
    ok: false,
    failure: {
      id: `failure:${code}:${target?.id ?? "scenario"}`,
      code,
      message,
      diagnostics,
      target,
    },
  };
}

function isFailure(value: ScenarioDocumentV1 | EditorCommandFailure): value is EditorCommandFailure {
  return "code" in value && "diagnostics" in value;
}

function requiresCommitConfirmation(diagnostic: EditorDiagnostic): boolean {
  return diagnostic.category === "placement" || diagnostic.category === "guideway" || diagnostic.category === "electrical";
}
