import {
  createAutosaveRecord,
  exportScenarioJson,
  importScenarioJson,
  parseAutosaveRecord,
  scenarioExportFilename,
  serializeAutosaveRecord,
  type EditorAutosaveRecord,
  type EditorCommandFailure,
  type EditorState,
} from "@atos/scenario-editor";
import { useMemo, useState } from "react";
import type { ScenarioDocumentV1 } from "@atos/scenario";

const AUTOSAVE_KEY = "atos.layout-editor.autosave.v1";

export function ScenarioFileControls({
  editor,
  failure,
  onDiscardAutosave,
  onImport,
  onRecover,
  onSaved,
}: {
  editor: EditorState;
  failure: EditorCommandFailure | null;
  onDiscardAutosave: () => void;
  onImport: (document: ScenarioDocumentV1) => void;
  onRecover: (record: EditorAutosaveRecord) => void;
  onSaved: (savedAt: string) => void;
}) {
  const [importText, setImportText] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const exportText = useMemo(() => exportScenarioJson(editor.draft), [editor.draft]);

  function importDraft(): void {
    const result = importScenarioJson(importText);
    if (!result.ok) {
      setLocalMessage(result.errors.map((error) => `${error.path}: ${error.code}: ${error.message}`).join("\n"));
      return;
    }
    setLocalMessage("Imported draft JSON.");
    onImport(result.document);
  }

  function downloadDraft(): void {
    const blob = new Blob([exportText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = scenarioExportFilename(editor.draft);
    link.click();
    URL.revokeObjectURL(url);
  }

  function saveLocal(): void {
    const savedAt = new Date().toISOString();
    const record = createAutosaveRecord({
      draft: editor.draft,
      selection: editor.selection,
      powerPresetId: editor.powerPresetId,
      savedAt,
    });
    localStorage.setItem(AUTOSAVE_KEY, serializeAutosaveRecord(record));
    setLocalMessage("Saved local autosave.");
    onSaved(savedAt);
  }

  function recoverLocal(): void {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) {
      setLocalMessage("No local autosave exists.");
      return;
    }
    const parsed = parseAutosaveRecord(raw);
    if (!parsed.ok) {
      setLocalMessage(parsed.errors.map((error) => `${error.path}: ${error.code}: ${error.message}`).join("\n"));
      return;
    }
    onRecover(parsed.record);
  }

  function discardLocal(): void {
    localStorage.removeItem(AUTOSAVE_KEY);
    setLocalMessage("Discarded local autosave.");
    onDiscardAutosave();
  }

  return (
    <section className="editor-panel file-controls" aria-label="Scenario import export and autosave">
      <h3>Scenario Files</h3>
      <div className="inline-actions">
        <button onClick={downloadDraft} type="button">Download JSON</button>
        <button onClick={saveLocal} type="button">Save Locally</button>
        <button onClick={recoverLocal} type="button">Recover Local</button>
        <button onClick={discardLocal} type="button">Discard Local</button>
      </div>
      <label>
        Exported scenario JSON
        <textarea readOnly rows={4} value={exportText} />
      </label>
      <label>
        Import scenario JSON
        <textarea onChange={(event) => setImportText(event.target.value)} rows={4} value={importText} />
      </label>
      <button onClick={importDraft} type="button">Import Draft</button>
      {localMessage ? <pre className="file-message">{localMessage}</pre> : null}
      {failure ? <pre className="file-message error">{failure.message}</pre> : null}
    </section>
  );
}
