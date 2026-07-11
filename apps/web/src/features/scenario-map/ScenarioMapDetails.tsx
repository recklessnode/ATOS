import { humanizeKind } from "./accessibility";
import type { DetailRecord } from "./render-model";
import type { ScenarioSelection } from "./selection";

export function ScenarioMapDetails({
  detail,
  onSelect,
}: {
  detail: DetailRecord | undefined;
  onSelect: (selection: ScenarioSelection) => void;
}) {
  if (!detail) {
    return (
      <aside className="scenario-map-details" aria-label="Selection details" aria-live="polite">
        <p className="workspace-status">Selection</p>
        <h3>No object selected</h3>
        <p>Select a tile, graph object, service marker, electrical object, or diagnostic.</p>
      </aside>
    );
  }

  return (
    <aside className="scenario-map-details" aria-label="Selection details" aria-live="polite">
      <p className="workspace-status">{detail.kindLabel}</p>
      <h3>{detail.label}</h3>
      <dl>
        <div>
          <dt>Stable ID</dt>
          <dd>{detail.selection.id}</dd>
        </div>
        {detail.properties.map((property) => (
          <div key={property.label}>
            <dt>{property.label}</dt>
            <dd>{property.value}</dd>
          </div>
        ))}
      </dl>
      {detail.related.length > 0 ? (
        <div className="related-list">
          <h4>Related objects</h4>
          {detail.related.map((selection) => (
            <button key={`${selection.kind}:${selection.id}`} onClick={() => onSelect(selection)} type="button">
              {humanizeKind(selection.kind)}: {selection.id}
            </button>
          ))}
        </div>
      ) : null}
      <details>
        <summary>Raw structured data</summary>
        <pre>{JSON.stringify(detail.raw, null, 2)}</pre>
      </details>
    </aside>
  );
}
