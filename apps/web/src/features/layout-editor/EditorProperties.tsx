import type { ScenarioDocumentV1 } from "@atos/scenario";
import type { EditorSelection } from "@atos/scenario-editor";

export function EditorProperties({
  document,
  onMetadataChange,
  selected,
}: {
  document: ScenarioDocumentV1;
  onMetadataChange: (metadata: { title?: string; description?: string; randomSeed?: string }) => void;
  selected: EditorSelection;
}) {
  const tile = selected?.kind === "tile" ? document.layout.tiles.find((item) => item.id === selected.id) : undefined;
  const setPiece = selected?.kind === "setPiece" ? document.layout.setPieces.find((item) => item.id === selected.id) : undefined;

  return (
    <section className="editor-panel" aria-label="Object properties">
      <h3>Properties</h3>
      <form
        className="metadata-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onMetadataChange({
            title: String(form.get("title") ?? document.scenario.title),
            description: String(form.get("description") ?? document.scenario.description),
            randomSeed: String(form.get("randomSeed") ?? document.randomSeed),
          });
        }}
      >
        <label>
          Scenario title
          <input defaultValue={document.scenario.title} name="title" />
        </label>
        <label>
          Description
          <textarea defaultValue={document.scenario.description} name="description" rows={2} />
        </label>
        <label>
          Seed
          <input defaultValue={document.randomSeed} name="randomSeed" />
        </label>
        <button type="submit">Update Metadata</button>
      </form>

      {tile ? (
        <dl className="property-list">
          <dt>Tile ID</dt><dd>{tile.id}</dd>
          <dt>Type/version</dt><dd>{tile.type}@{tile.version}</dd>
          <dt>Coordinate</dt><dd>q {tile.coordinate.q}, r {tile.coordinate.r}</dd>
          <dt>Orientation</dt><dd>{tile.orientation}</dd>
          <dt>Contained set pieces</dt><dd>{document.layout.setPieces.filter((piece) => piece.tileId === tile.id).map((piece) => piece.id).join(", ") || "none"}</dd>
        </dl>
      ) : null}

      {setPiece ? (
        <dl className="property-list">
          <dt>Set-piece ID</dt><dd>{setPiece.id}</dd>
          <dt>Type/version</dt><dd>{setPiece.type}@{setPiece.version}</dd>
          <dt>Host tile</dt><dd>{setPiece.tileId}</dd>
          <dt>Guideway anchor</dt><dd>{setPiece.localGuidewayNodeId ?? "none"}</dd>
          <dt>Electrical anchor</dt><dd>{setPiece.localElectricalNodeId ?? "none"}</dd>
        </dl>
      ) : null}

      {!tile && !setPiece ? <p>Select a tile or set piece to inspect editable object data.</p> : null}
    </section>
  );
}
