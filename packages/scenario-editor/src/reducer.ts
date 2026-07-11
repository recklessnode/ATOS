import type { PowerPresetId } from "@atos/power";
import type { ScenarioDocumentV1 } from "@atos/scenario";
import { createEditorHistory } from "./history";
import { cloneScenarioDocument, deriveEditorState, rebuildScenarioDocument } from "./rebuild";
import type { EditorHistory, EditorSelection, EditorState } from "./types";

export type CreateEditorStateOptions = {
  powerPresetId?: PowerPresetId;
  historyLimit?: number;
  selection?: EditorSelection;
};

export function createEditorState(
  canonical: ScenarioDocumentV1,
  options: CreateEditorStateOptions = {},
): EditorState {
  const rebuilt = rebuildScenarioDocument(canonical);
  const powerPresetId = options.powerPresetId ?? "normal_operations";
  return {
    canonical: cloneScenarioDocument(rebuilt),
    draft: cloneScenarioDocument(rebuilt),
    selection: options.selection ?? null,
    powerPresetId,
    derived: deriveEditorState(rebuilt, powerPresetId),
    history: createEditorHistory(options.historyLimit),
    dirty: false,
  };
}

export function stateFromSnapshot(input: {
  state: EditorState;
  draft: ScenarioDocumentV1;
  selection: EditorSelection;
  powerPresetId: PowerPresetId;
  history: EditorHistory;
  dirty?: boolean;
}): EditorState {
  const draft = rebuildScenarioDocument(input.draft);
  return {
    ...input.state,
    draft,
    preview: undefined,
    selection: input.selection,
    powerPresetId: input.powerPresetId,
    derived: deriveEditorState(draft, input.powerPresetId),
    history: input.history,
    dirty: input.dirty ?? true,
  };
}
