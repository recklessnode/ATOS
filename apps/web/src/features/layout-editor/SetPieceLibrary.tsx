import { useMemo, useState } from "react";
import type { EditorCatalogSetPiece } from "@atos/scenario-editor";

export function SetPieceLibrary({
  activeType,
  items,
  onSelect,
}: {
  activeType?: string;
  items: readonly EditorCatalogSetPiece[];
  onSelect: (item: EditorCatalogSetPiece) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterSetPieces(items, query), [items, query]);

  return (
    <section className="catalog-panel" aria-label="Set-piece library">
      <div className="catalog-heading">
        <h3>Set-Piece Library</h3>
        <input
          aria-label="Search set-piece library"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search set pieces"
          type="search"
          value={query}
        />
      </div>
      <div className="catalog-list">
        {filtered.map((item) => (
          <button
            aria-pressed={activeType === item.type}
            className={activeType === item.type ? "active" : ""}
            key={`${item.type}@${item.version}`}
            onClick={() => onSelect(item)}
            type="button"
          >
            <strong>{item.label}</strong>
            <span>{item.type}@{item.version}</span>
            <small>Electrical: {item.electricalContribution}</small>
            <small>Service: {item.serviceContribution}</small>
            <small>Dispatch: {item.dispatchContribution}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function filterSetPieces(items: readonly EditorCatalogSetPiece[], query: string): EditorCatalogSetPiece[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...items];
  }
  return items.filter((item) =>
    [item.label, item.type, item.category, item.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}
