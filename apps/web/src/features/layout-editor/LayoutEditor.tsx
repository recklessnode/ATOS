import { useMemo, useState } from "react";
import { POWER_PRESETS, type PowerPresetId } from "@atos/power";
import { loadSixTileCityFixture } from "@atos/scenario";
import {
  applyEditorCommand,
  buildSetPieceCatalog,
  buildTileCatalog,
  createEditorState,
  type EditorCatalogSetPiece,
  type EditorCatalogTile,
  type EditorCommand,
  type EditorCommandFailure,
  type EditorSelection,
  type EditorState,
} from "@atos/scenario-editor";
import { buildScenarioMapRenderModel } from "../scenario-map/render-model";
import { EditorDiagnostics } from "./EditorDiagnostics";
import { EditorProperties } from "./EditorProperties";
import { EditorToolbar } from "./EditorToolbar";
import { LayoutEditorMap } from "./LayoutEditorMap";
import { RecommendationPreview } from "./RecommendationPreview";
import { ScenarioFileControls } from "./ScenarioFileControls";
import { SetPieceLibrary } from "./SetPieceLibrary";
import { TileLibrary } from "./TileLibrary";
import "./LayoutEditor.css";

const DEFAULT_PLACE_COORDINATE = { q: 2, r: -2 };

export type ActiveCatalogItem =
  | { kind: "tile"; item: EditorCatalogTile }
  | { kind: "setPiece"; item: EditorCatalogSetPiece }
  | null;

export function LayoutEditor() {
  const [editor, setEditor] = useState<EditorState>(() => createEditorState(loadSixTileCityFixture()));
  const [selection, setSelection] = useState<EditorSelection>(editor.selection);
  const [activeCatalogItem, setActiveCatalogItem] = useState<ActiveCatalogItem>(null);
  const [targetQ, setTargetQ] = useState(String(DEFAULT_PLACE_COORDINATE.q));
  const [targetR, setTargetR] = useState(String(DEFAULT_PLACE_COORDINATE.r));
  const [failure, setFailure] = useState<EditorCommandFailure | null>(null);
  const [pendingWarningCommand, setPendingWarningCommand] = useState<EditorCommand | null>(null);
  const [announcement, setAnnouncement] = useState("Layout editor ready.");
  const tileCatalog = useMemo(() => buildTileCatalog(), []);
  const setPieceCatalog = useMemo(() => buildSetPieceCatalog(), []);
  const visibleDocument = editor.preview?.document ?? editor.draft;
  const visiblePower = editor.preview?.powerAnalysis ?? editor.derived.powerAnalysis;
  const mapModel = useMemo(
    () => buildScenarioMapRenderModel(visibleDocument, { powerAnalysis: visiblePower }),
    [visibleDocument, visiblePower],
  );
  const targetCoordinate = {
    q: Number.parseInt(targetQ, 10) || 0,
    r: Number.parseInt(targetR, 10) || 0,
  };

  function run(command: EditorCommand): void {
    const result = applyEditorCommand(editor, command);
    if (result.ok) {
      setEditor(result.state);
      setSelection(result.state.selection);
      setFailure(null);
      setPendingWarningCommand(null);
      setAnnouncement(result.event.message);
      return;
    }

    setFailure(result.failure);
    setAnnouncement(result.failure.message);
    setPendingWarningCommand(result.failure.code === "warnings_require_confirmation" ? command : null);
  }

  function runWithWarningConfirmation(): void {
    if (pendingWarningCommand) {
      run(withCommitWarnings(pendingWarningCommand));
    }
  }

  function handleSelection(nextSelection: EditorSelection): void {
    setSelection(nextSelection);
    setAnnouncement(nextSelection ? `Selected ${nextSelection.kind} ${nextSelection.id}.` : "Selection cleared.");
  }

  function placeAtTarget(): void {
    if (!activeCatalogItem) {
      setFailure({
        id: "failure:no-catalog-item",
        code: "no_active_catalog_item",
        message: "Choose a tile or set piece before placing.",
        diagnostics: [],
      });
      return;
    }
    if (activeCatalogItem.kind === "tile") {
      run({
        type: "tile.add",
        tileType: activeCatalogItem.item.type,
        version: activeCatalogItem.item.version,
        coordinate: targetCoordinate,
      });
      return;
    }
    const selectedTileId = selection?.kind === "tile" ? selection.id : undefined;
    if (!selectedTileId) {
      setFailure({
        id: "failure:no-host-tile",
        code: "no_host_tile",
        message: "Select a host tile before placing a set piece.",
        diagnostics: [],
      });
      return;
    }
    run({
      type: "setPiece.add",
      setPieceType: activeCatalogItem.item.type,
      version: activeCatalogItem.item.version,
      tileId: selectedTileId,
    });
  }

  function moveSelectedToTarget(): void {
    if (selection?.kind === "tile") {
      run({ type: "tile.move", tileId: selection.id, coordinate: targetCoordinate });
      return;
    }
    if (selection?.kind === "setPiece") {
      const host = visibleDocument.layout.tiles.find((tile) => tile.coordinate.q === targetCoordinate.q && tile.coordinate.r === targetCoordinate.r);
      if (host) {
        run({ type: "setPiece.move", setPieceId: selection.id, tileId: host.id });
      }
    }
  }

  function removeSelected(): void {
    if (!selection) {
      return;
    }
    const confirmed = typeof window === "undefined" || window.confirm(`Remove ${selection.kind} ${selection.id}?`);
    if (!confirmed) {
      return;
    }
    if (selection.kind === "tile") {
      run({ type: "tile.remove", tileId: selection.id });
    }
    if (selection.kind === "setPiece") {
      run({ type: "setPiece.remove", setPieceId: selection.id });
    }
  }

  function duplicateSelected(): void {
    if (selection?.kind === "tile") {
      run({ type: "tile.duplicate", tileId: selection.id, coordinate: targetCoordinate });
    }
    if (selection?.kind === "setPiece") {
      run({ type: "setPiece.duplicate", setPieceId: selection.id });
    }
  }

  function rotateSelected(steps: number): void {
    if (selection?.kind === "tile") {
      run({ type: "tile.rotate", tileId: selection.id, steps });
    }
    if (selection?.kind === "setPiece") {
      run({ type: "setPiece.rotate", setPieceId: selection.id, steps });
    }
  }

  return (
    <section className="layout-editor" id="layout" aria-label="Layout editor workspace">
      <div className="layout-editor-heading">
        <div>
          <p className="workspace-status">Layout</p>
          <h2>Scenario Layout Editor</h2>
        </div>
        <p>
          Draft scenario construction with immutable commands, live graph rebuilds, power analysis,
          recommendation previews, import/export, and local browser autosave.
        </p>
      </div>

      <div className="layout-editor-status" aria-live="polite">
        <strong>{editor.derived.validationState}</strong>
        <span>{editor.dirty ? "Draft has unexported edits." : "Draft matches the loaded scenario."}</span>
        <span>{announcement}</span>
      </div>

      <div className="layout-editor-grid">
        <aside className="layout-library-panel" aria-label="Layout libraries">
          <TileLibrary
            activeType={activeCatalogItem?.kind === "tile" ? activeCatalogItem.item.type : undefined}
            items={tileCatalog}
            onSelect={(item) => setActiveCatalogItem({ kind: "tile", item })}
          />
          <SetPieceLibrary
            activeType={activeCatalogItem?.kind === "setPiece" ? activeCatalogItem.item.type : undefined}
            items={setPieceCatalog}
            onSelect={(item) => setActiveCatalogItem({ kind: "setPiece", item })}
          />
        </aside>

        <div className="layout-editor-main">
          <EditorToolbar
            activeCatalogItem={activeCatalogItem}
            canRedo={editor.history.redoStack.length > 0}
            canUndo={editor.history.undoStack.length > 0}
            onCancelPlacement={() => {
              setActiveCatalogItem(null);
              setAnnouncement("Placement cancelled.");
            }}
            onDuplicate={duplicateSelected}
            onMove={moveSelectedToTarget}
            onPlace={placeAtTarget}
            onRedo={() => run({ type: "history.redo" })}
            onRemove={removeSelected}
            onReset={() => run({ type: "draft.resetToCanonical" })}
            onRotateClockwise={() => rotateSelected(1)}
            onRotateCounterClockwise={() => rotateSelected(-1)}
            onUndo={() => run({ type: "history.undo" })}
            selected={selection}
            setTargetQ={setTargetQ}
            setTargetR={setTargetR}
            targetQ={targetQ}
            targetR={targetR}
          />

          {pendingWarningCommand ? (
            <div className="layout-warning-confirmation" role="alert">
              <span>{failure?.message}</span>
              <button onClick={runWithWarningConfirmation} type="button">
                Commit warning edit
              </button>
            </div>
          ) : null}

          <label className="layout-preset-control">
            Power preset
            <select value={editor.powerPresetId} onChange={(event) => run({ type: "power.setPreset", presetId: event.target.value as PowerPresetId })}>
              {POWER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <LayoutEditorMap
            activeCatalogItem={activeCatalogItem}
            diagnostics={editor.preview?.diagnostics ?? editor.derived.diagnostics}
            model={mapModel}
            onCoordinateTarget={(coordinate) => {
              setTargetQ(String(coordinate.q));
              setTargetR(String(coordinate.r));
            }}
            onMoveTile={(tileId, coordinate) => run({ type: "tile.move", tileId, coordinate, commitWarnings: true })}
            onPlaceAt={(coordinate) => {
              setTargetQ(String(coordinate.q));
              setTargetR(String(coordinate.r));
              if (activeCatalogItem?.kind === "tile") {
                run({
                  type: "tile.add",
                  tileType: activeCatalogItem.item.type,
                  version: activeCatalogItem.item.version,
                  coordinate,
                });
              }
            }}
            onSelect={handleSelection}
            selected={selection}
          />
        </div>

        <aside className="layout-inspector-panel" aria-label="Layout inspector">
          <EditorProperties
            document={visibleDocument}
            onMetadataChange={(metadata) => run({ type: "scenario.updateMetadata", ...metadata })}
            selected={selection}
          />
          <EditorDiagnostics diagnostics={editor.preview?.diagnostics ?? editor.derived.diagnostics} onSelect={handleSelection} />
          <RecommendationPreview
            editor={editor}
            onAccept={() => run({ type: "powerRecommendation.acceptPreview" })}
            onPreview={(recommendationId) => run({ type: "powerRecommendation.preview", recommendationId })}
            onReject={() => run({ type: "powerRecommendation.rejectPreview" })}
            onSelect={handleSelection}
          />
          <ScenarioFileControls
            editor={editor}
            failure={failure}
            onDiscardAutosave={() => setAnnouncement("Discarded local autosave.")}
            onImport={(document) => run({ type: "import.replaceDraft", document, commitWarnings: true })}
            onRecover={(record) => {
              const recovered = createEditorState(record.draft, {
                powerPresetId: record.powerPresetId,
                selection: record.selection,
              });
              setEditor(recovered);
              setSelection(record.selection);
              setAnnouncement(`Recovered autosave from ${record.savedAt}.`);
            }}
            onSaved={(savedAt) => setAnnouncement(`Saved draft locally at ${savedAt}.`)}
          />
        </aside>
      </div>
    </section>
  );
}

function withCommitWarnings(command: EditorCommand): EditorCommand {
  return { ...command, commitWarnings: true } as EditorCommand;
}
