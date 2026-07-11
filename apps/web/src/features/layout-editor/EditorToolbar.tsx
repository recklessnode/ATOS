import type { EditorSelection } from "@atos/scenario-editor";
import type { ActiveCatalogItem } from "./LayoutEditor";

export function EditorToolbar({
  activeCatalogItem,
  canRedo,
  canUndo,
  onCancelPlacement,
  onDuplicate,
  onMove,
  onPlace,
  onRedo,
  onRemove,
  onReset,
  onRotateClockwise,
  onRotateCounterClockwise,
  onUndo,
  selected,
  setTargetQ,
  setTargetR,
  targetQ,
  targetR,
}: {
  activeCatalogItem: ActiveCatalogItem;
  canRedo: boolean;
  canUndo: boolean;
  onCancelPlacement: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onPlace: () => void;
  onRedo: () => void;
  onRemove: () => void;
  onReset: () => void;
  onRotateClockwise: () => void;
  onRotateCounterClockwise: () => void;
  onUndo: () => void;
  selected: EditorSelection;
  setTargetQ: (value: string) => void;
  setTargetR: (value: string) => void;
  targetQ: string;
  targetR: string;
}) {
  return (
    <div className="editor-toolbar" aria-label="Layout editing commands">
      <div className="tool-group">
        <button disabled={!canUndo} onClick={onUndo} type="button">Undo</button>
        <button disabled={!canRedo} onClick={onRedo} type="button">Redo</button>
        <button onClick={onReset} type="button">Reset Draft</button>
      </div>
      <div className="tool-group coordinate-controls">
        <label>
          q
          <input aria-label="Target q coordinate" inputMode="numeric" onChange={(event) => setTargetQ(event.target.value)} value={targetQ} />
        </label>
        <label>
          r
          <input aria-label="Target r coordinate" inputMode="numeric" onChange={(event) => setTargetR(event.target.value)} value={targetR} />
        </label>
      </div>
      <div className="tool-group">
        <button disabled={!activeCatalogItem} onClick={onPlace} type="button">Place</button>
        <button disabled={!activeCatalogItem} onClick={onCancelPlacement} type="button">Cancel</button>
        <button disabled={!selected} onClick={onMove} type="button">Move</button>
        <button disabled={selected?.kind !== "tile" && selected?.kind !== "setPiece"} onClick={onRotateCounterClockwise} type="button">Rotate CCW</button>
        <button disabled={selected?.kind !== "tile" && selected?.kind !== "setPiece"} onClick={onRotateClockwise} type="button">Rotate CW</button>
        <button disabled={selected?.kind !== "tile" && selected?.kind !== "setPiece"} onClick={onDuplicate} type="button">Duplicate</button>
        <button disabled={selected?.kind !== "tile" && selected?.kind !== "setPiece"} onClick={onRemove} type="button">Delete</button>
      </div>
      <p className="active-tool">
        {activeCatalogItem ? `Active ${activeCatalogItem.kind}: ${activeCatalogItem.item.label}` : "No active placement"}
      </p>
    </div>
  );
}
