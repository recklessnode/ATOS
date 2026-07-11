import type { EditorHistory, EditorSnapshot, EditorState } from "./types";
import { DEFAULT_EDITOR_HISTORY_LIMIT } from "./types";
import { cloneScenarioDocument } from "./rebuild";

export function createEditorHistory(limit = DEFAULT_EDITOR_HISTORY_LIMIT): EditorHistory {
  return { undoStack: [], redoStack: [], limit };
}

export function snapshotFromState(state: EditorState): EditorSnapshot {
  return {
    draft: cloneScenarioDocument(state.draft),
    selection: state.selection ? { ...state.selection } : null,
    powerPresetId: state.powerPresetId,
  };
}

export function pushUndoSnapshot(history: EditorHistory, snapshot: EditorSnapshot): EditorHistory {
  return {
    undoStack: [...history.undoStack, snapshot].slice(-history.limit),
    redoStack: [],
    limit: history.limit,
  };
}

export function pushRedoSnapshot(history: EditorHistory, snapshot: EditorSnapshot): EditorHistory {
  return {
    undoStack: history.undoStack,
    redoStack: [...history.redoStack, snapshot].slice(-history.limit),
    limit: history.limit,
  };
}
