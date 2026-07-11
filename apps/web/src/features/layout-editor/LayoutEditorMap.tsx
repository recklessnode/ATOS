import { useMemo, useState, type KeyboardEvent } from "react";
import {
  axialKey,
  axialNeighbor,
  axialToPixel,
  EDGE_INDEXES,
  pointyTopHexPoints,
  polygonPoints,
  type AxialCoordinate,
} from "@atos/layout";
import type { EditorDiagnostic, EditorSelection } from "@atos/scenario-editor";
import type { ScenarioMapRenderModel } from "../scenario-map/render-model";
import type { ActiveCatalogItem } from "./LayoutEditor";

const MAP_RADIUS = 82;

export function LayoutEditorMap({
  activeCatalogItem,
  diagnostics,
  model,
  onCoordinateTarget,
  onMoveTile,
  onPlaceAt,
  onSelect,
  selected,
}: {
  activeCatalogItem: ActiveCatalogItem;
  diagnostics: readonly EditorDiagnostic[];
  model: ScenarioMapRenderModel;
  onCoordinateTarget: (coordinate: AxialCoordinate) => void;
  onMoveTile: (tileId: string, coordinate: AxialCoordinate) => void;
  onPlaceAt: (coordinate: AxialCoordinate) => void;
  onSelect: (selection: EditorSelection) => void;
  selected: EditorSelection;
}) {
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);
  const candidates = useMemo(() => emptyNeighborCoordinates(model), [model]);
  const diagnosticIds = useMemo(() => new Set(diagnostics.flatMap((diagnostic) => diagnostic.affectedIds)), [diagnostics]);
  const viewBox = viewBoxForModel(model);

  function handleMapKeyDown(event: KeyboardEvent<SVGSVGElement>): void {
    if (event.key === "Escape") {
      onSelect(null);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
    }
  }

  return (
    <section className="layout-map-panel" aria-label="Editable scenario map">
      <svg
        aria-label="Editable ATOS scenario draft map"
        className="layout-editor-map"
        data-testid="layout-editor-map"
        onKeyDown={handleMapKeyDown}
        role="group"
        tabIndex={0}
        viewBox={viewBox}
      >
        <defs>
          <pattern id="layout-warning-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 8 L8 0" stroke="#8a3a12" strokeWidth="1.5" />
          </pattern>
        </defs>

        <g aria-label="Placement target coordinates">
          {candidates.map((coordinate) => {
            const center = axialToPixel(coordinate, MAP_RADIUS);
            const key = axialKey(coordinate);
            return (
              <polygon
                aria-label={`Empty coordinate ${key}${activeCatalogItem?.kind === "tile" ? ", place selected tile" : ""}`}
                className={`candidate-tile ${activeCatalogItem?.kind === "tile" ? "valid-target" : ""}`}
                data-testid={`candidate-${key}`}
                key={key}
                onClick={() => {
                  onCoordinateTarget(coordinate);
                  if (activeCatalogItem?.kind === "tile") {
                    onPlaceAt(coordinate);
                  }
                }}
                onPointerUp={() => {
                  if (draggingTileId) {
                    onMoveTile(draggingTileId, coordinate);
                    setDraggingTileId(null);
                  }
                }}
                points={polygonPoints(pointyTopHexPoints(center, MAP_RADIUS))}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onCoordinateTarget(coordinate);
                    if (activeCatalogItem?.kind === "tile") {
                      onPlaceAt(coordinate);
                    }
                  }
                }}
              />
            );
          })}
        </g>

        <g aria-label="Draft tiles">
          {model.tiles.map((tile) => {
            const selectedClass = selected?.kind === "tile" && selected.id === tile.id ? "selected" : "";
            const diagnosticClass = diagnosticIds.has(tile.id) ? "has-diagnostic" : "";
            return (
              <g key={tile.id}>
                <polygon
                  aria-label={`${tile.label}, ${tile.coordinateLabel}, ${tile.orientationLabel}. Drag or select tile ${tile.id}.`}
                  className={`draft-tile ${selectedClass} ${diagnosticClass}`}
                  data-testid={`layout-tile-${tile.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect({ kind: "tile", id: tile.id });
                  }}
                  onKeyDown={(event) => handleObjectKeyDown(event, () => onSelect({ kind: "tile", id: tile.id }))}
                  onPointerDown={() => {
                    setDraggingTileId(tile.id);
                  }}
                  onPointerUp={() => setDraggingTileId(null)}
                  points={tile.polygon}
                  role="button"
                  tabIndex={0}
                />
                <line className="draft-orientation" x1={tile.center.x} x2={tile.orientationEnd.x} y1={tile.center.y} y2={tile.orientationEnd.y} />
                <text className="draft-tile-label" x={tile.center.x} y={tile.center.y - 8}>{tile.label}</text>
                <text className="draft-tile-id" x={tile.center.x} y={tile.center.y + 13}>{tile.id}</text>
              </g>
            );
          })}
        </g>

        <g aria-label="Draft guideway graph">
          {model.guidewayLinks.map((link) => (
            <line className="draft-guideway" key={link.id} x1={link.from.x} x2={link.to.x} y1={link.from.y} y2={link.to.y} />
          ))}
        </g>

        <g aria-label="Draft electrical graph">
          {model.electricalBranches.map((branch) => (
            <line className="draft-electrical" key={branch.id} x1={branch.from.x} x2={branch.to.x} y1={branch.from.y} y2={branch.to.y} />
          ))}
          {model.electricalSources.map((source) => (
            <circle className="draft-source" cx={source.point.x} cy={source.point.y} key={source.id} r="9" />
          ))}
          {model.electricalLoads.map((load) => (
            <rect className="draft-load" height="14" key={load.id} width="14" x={load.point.x - 7} y={load.point.y - 7} />
          ))}
        </g>

        <g aria-label="Draft set pieces">
          {model.setPieces.map((setPiece) => {
            const selectedClass = selected?.kind === "setPiece" && selected.id === setPiece.id ? "selected" : "";
            const diagnosticClass = diagnosticIds.has(setPiece.id) ? "has-diagnostic" : "";
            return (
              <g
                aria-label={`${setPiece.label} set piece ${setPiece.id}`}
                className={`draft-set-piece ${selectedClass} ${diagnosticClass}`}
                data-testid={`layout-set-piece-${setPiece.id}`}
                key={setPiece.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ kind: "setPiece", id: setPiece.id });
                }}
                onKeyDown={(event) => handleObjectKeyDown(event, () => onSelect({ kind: "setPiece", id: setPiece.id }))}
                role="button"
                tabIndex={0}
              >
                <circle cx={setPiece.point.x} cy={setPiece.point.y} r="13" />
                <text x={setPiece.point.x} y={setPiece.point.y + 4}>S</text>
              </g>
            );
          })}
        </g>

        <g aria-label="Power recommendation preview additions">
          {model.tiles
            .filter((tile) => tile.id.startsWith("tile-power-injection-curve"))
            .map((tile) => (
              <text className="preview-added-label" key={tile.id} x={tile.center.x} y={tile.center.y + 34}>
                preview/add
              </text>
            ))}
        </g>
      </svg>
      <p className="map-help">
        Select a library item, then choose an empty coordinate. Drag a tile onto a target outline or use q/r controls.
      </p>
    </section>
  );
}

function handleObjectKeyDown(event: KeyboardEvent<SVGGElement | SVGPolygonElement>, action: () => void): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function emptyNeighborCoordinates(model: ScenarioMapRenderModel): AxialCoordinate[] {
  const occupied = new Set(model.document.layout.tiles.map((tile) => axialKey(tile.coordinate)));
  const candidates = new Map<string, AxialCoordinate>();
  for (const tile of model.document.layout.tiles) {
    for (const edge of EDGE_INDEXES) {
      const coordinate = axialNeighbor(tile.coordinate, edge);
      if (!occupied.has(axialKey(coordinate))) {
        candidates.set(axialKey(coordinate), coordinate);
      }
    }
  }
  return [...candidates.values()].sort((left, right) => axialKey(left).localeCompare(axialKey(right)));
}

function viewBoxForModel(model: ScenarioMapRenderModel): string {
  const padding = 170;
  const minX = model.bounds.minX - padding;
  const minY = model.bounds.minY - padding;
  const width = model.bounds.maxX - model.bounds.minX + padding * 2;
  const height = model.bounds.maxY - model.bounds.minY + padding * 2;
  return `${minX} ${minY} ${width} ${height}`;
}
