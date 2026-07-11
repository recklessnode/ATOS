import { useMemo, useState } from "react";
import type { EditorCatalogTile } from "@atos/scenario-editor";

export function TileLibrary({
  activeType,
  items,
  onSelect,
}: {
  activeType?: string;
  items: readonly EditorCatalogTile[];
  onSelect: (item: EditorCatalogTile) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterTiles(items, query), [items, query]);

  return (
    <section className="catalog-panel" aria-label="Tile library">
      <div className="catalog-heading">
        <h3>Tile Library</h3>
        <input
          aria-label="Search tile library"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tiles"
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
            <small>Guideway: {item.guidewayConnectors}</small>
            <small>Electrical: {item.electricalConnectors}</small>
            <small>Power: {item.builtInPower}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function filterTiles(items: readonly EditorCatalogTile[], query: string): EditorCatalogTile[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...items];
  }
  return items.filter((item) =>
    [item.label, item.type, item.tags.join(" "), item.allowedSetPieces.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}
