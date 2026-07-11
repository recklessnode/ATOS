import { useMemo, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { describeSelection, diagnosticLabel } from "./accessibility";
import { ScenarioMapDetails } from "./ScenarioMapDetails";
import { ScenarioMapDiagnostics } from "./ScenarioMapDiagnostics";
import { ScenarioMapLayersControl } from "./ScenarioMapLayers";
import { ScenarioMapToolbar } from "./ScenarioMapToolbar";
import {
  buildSixTileScenarioMapModel,
  type MapDiagnostic,
  type RenderLine,
  type RenderPoint,
  type RenderTile,
  type ScenarioMapLayerId,
  type ScenarioMapRenderModel,
} from "./render-model";
import {
  isSelected,
  relatedSelectionKeys,
  selectionKey,
  type ScenarioSelection,
} from "./selection";
import {
  DEFAULT_VIEWPORT,
  initialViewState,
  reduceViewState,
  svgTransform,
} from "./view-state";
import "./ScenarioMap.css";

type PointerTracker = {
  lastPoint: { x: number; y: number } | null;
  moved: boolean;
  pointers: Map<number, { x: number; y: number }>;
  pinchDistance: number | null;
};

export function ScenarioMap({ model: providedModel }: { model?: ScenarioMapRenderModel }) {
  const fixtureModel = useMemo(() => buildSixTileScenarioMapModel(), []);
  const model = providedModel ?? fixtureModel;
  const [layers, setLayers] = useState(model.layers);
  const [selection, setSelection] = useState<ScenarioSelection | null>(null);
  const initialView = useMemo(() => initialViewState(model.bounds, DEFAULT_VIEWPORT), [model.bounds]);
  const [view, dispatchView] = useReducer(reduceViewState, initialView);
  const tracker = useRef<PointerTracker>({
    lastPoint: null,
    moved: false,
    pointers: new Map(),
    pinchDistance: null,
  });
  const selectedDetail = selection ? model.detailByKey.get(selectionKey(selection)) : undefined;
  const selectedRelatedKeys = relatedSelectionKeys(selection, model.relationMap);

  function toggleLayer(layer: ScenarioMapLayerId): void {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  function selectAndFocus(nextSelection: ScenarioSelection): void {
    setSelection(nextSelection);
    ensureLayerVisible(nextSelection);
    focusSelection(nextSelection);
  }

  function ensureLayerVisible(nextSelection: ScenarioSelection): void {
    if (nextSelection.kind.startsWith("electrical")) {
      setLayers((current) => ({ ...current, electrical: true }));
    }
    if (nextSelection.kind === "diagnostic") {
      setLayers((current) => ({ ...current, diagnostics: true }));
    }
    if (nextSelection.kind === "station" || nextSelection.kind === "serviceZone") {
      setLayers((current) => ({ ...current, stations: true }));
    }
    if (nextSelection.kind.startsWith("guideway")) {
      setLayers((current) => ({ ...current, guideway: true }));
    }
  }

  function focusSelection(nextSelection: ScenarioSelection | null): void {
    if (!nextSelection) {
      return;
    }
    const bounds = model.boundsByKey.get(selectionKey(nextSelection));
    if (bounds) {
      dispatchView({ type: "focus", bounds, viewport: DEFAULT_VIEWPORT });
    }
  }

  function handleObjectSelect(nextSelection: ScenarioSelection): void {
    setSelection(nextSelection);
  }

  function handleObjectKeyDown(event: KeyboardEvent, nextSelection: ScenarioSelection): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleObjectSelect(nextSelection);
    }
  }

  function handleMapKeyDown(event: KeyboardEvent<SVGSVGElement | HTMLElement>): void {
    if (event.key === "Escape") {
      setSelection(null);
    }
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>): void {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    dispatchView({
      type: "zoom",
      viewportPoint: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      scaleMultiplier: event.deltaY < 0 ? 1.12 : 0.88,
    });
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    const point = { x: event.clientX, y: event.clientY };
    tracker.current.pointers.set(event.pointerId, point);
    tracker.current.lastPoint = point;
    tracker.current.moved = false;
    if (tracker.current.pointers.size === 2) {
      tracker.current.pinchDistance = pointerDistance([...tracker.current.pointers.values()]);
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>): void {
    const nextPoint = { x: event.clientX, y: event.clientY };
    tracker.current.pointers.set(event.pointerId, nextPoint);

    if (tracker.current.pointers.size === 2) {
      const points = [...tracker.current.pointers.values()];
      const nextDistance = pointerDistance(points);
      const lastDistance = tracker.current.pinchDistance ?? nextDistance;
      if (lastDistance > 0) {
        dispatchView({
          type: "zoom",
          viewportPoint: averageViewportPoint(points, event.currentTarget.getBoundingClientRect()),
          scaleMultiplier: nextDistance / lastDistance,
        });
      }
      tracker.current.pinchDistance = nextDistance;
      tracker.current.moved = true;
      return;
    }

    const lastPoint = tracker.current.lastPoint;
    if (!lastPoint) {
      tracker.current.lastPoint = nextPoint;
      return;
    }
    const delta = { x: nextPoint.x - lastPoint.x, y: nextPoint.y - lastPoint.y };
    if (Math.abs(delta.x) > 0 || Math.abs(delta.y) > 0) {
      tracker.current.moved = true;
      dispatchView({ type: "pan", delta });
    }
    tracker.current.lastPoint = nextPoint;
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>): void {
    tracker.current.pointers.delete(event.pointerId);
    tracker.current.pinchDistance = null;
    if (!tracker.current.moved && event.target === event.currentTarget) {
      setSelection(null);
    }
    tracker.current.lastPoint = null;
  }

  function firstDiagnosticSelection(): ScenarioSelection | undefined {
    return model.focusTargets.firstDiagnostic ?? model.diagnostics[0]?.selection;
  }

  return (
    <section className="scenario-map-workspace" id="layout" aria-label="Layout workspace">
      <div className="scenario-map-heading">
        <div>
          <p className="workspace-status">Layout</p>
          <h2>Scenario Map Inspector</h2>
        </div>
        <p>
          Read-only SVG inspection of the deterministic six-tile scenario, extracted guideway graph,
          station services, electrical graph, and diagnostics.
        </p>
      </div>

      <div className="scenario-map-shell" onKeyDown={handleMapKeyDown}>
        <div className="scenario-map-main">
          <ScenarioMapToolbar
            canFocusSelected={Boolean(selection)}
            onFit={() => dispatchView({ type: "fit", bounds: model.bounds, viewport: DEFAULT_VIEWPORT })}
            onFocusDiagnostic={() => {
              const diagnostic = firstDiagnosticSelection();
              if (diagnostic) {
                selectAndFocus(diagnostic);
              }
            }}
            onFocusSelected={() => focusSelection(selection)}
            onFocusSource={() => {
              if (model.focusTargets.electricalSource) {
                selectAndFocus(model.focusTargets.electricalSource);
              }
            }}
            onFocusStation={() => {
              if (model.focusTargets.station) {
                selectAndFocus(model.focusTargets.station);
              }
            }}
            onReset={() => dispatchView({ type: "reset", initial: initialView })}
            onZoomIn={() =>
              dispatchView({
                type: "zoom",
                viewportPoint: { x: DEFAULT_VIEWPORT.width / 2, y: DEFAULT_VIEWPORT.height / 2 },
                scaleMultiplier: 1.2,
              })
            }
            onZoomOut={() =>
              dispatchView({
                type: "zoom",
                viewportPoint: { x: DEFAULT_VIEWPORT.width / 2, y: DEFAULT_VIEWPORT.height / 2 },
                scaleMultiplier: 0.8,
              })
            }
          />
          <ScenarioMapLayersControl layers={layers} onToggle={toggleLayer} />

          <svg
            aria-label="ATOS six-tile scenario map"
            className="scenario-map-canvas"
            data-testid="scenario-map-svg"
            onClick={(event) => {
              if ((event.target as Element).classList.contains("scenario-map-hitplane")) {
                setSelection(null);
              }
            }}
            onKeyDown={handleMapKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            role="img"
            tabIndex={0}
            viewBox={`0 0 ${DEFAULT_VIEWPORT.width} ${DEFAULT_VIEWPORT.height}`}
          >
            <defs>
              <pattern id="diag-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 8 L8 0" stroke="#8a3a12" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect className="scenario-map-hitplane" height="100%" width="100%" />
            <g transform={svgTransform(view)}>
              {layers.tiles ? (
                <g aria-label="Hex tile layer">
                  {model.tiles.map((tile) => (
                    <SelectableTile
                      key={tile.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                      tile={tile}
                    />
                  ))}
                </g>
              ) : null}

              {layers.guideway ? (
                <g aria-label="Guideway layer">
                  {model.guidewayLinks.map((link) => (
                    <SelectableLine
                      className="guideway-link"
                      key={link.id}
                      line={link}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                  {model.guidewayNodes.map((node) => (
                    <SelectablePoint
                      className="guideway-node"
                      key={node.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      point={node}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                </g>
              ) : null}

              {layers.stations ? (
                <g aria-label="Station and service-zone layer">
                  {model.stations.map((station) => (
                    <SelectablePoint
                      className="station-marker"
                      key={station.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      point={station}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                  {model.serviceZones.map((serviceZone) => (
                    <SelectablePoint
                      className="service-zone-marker"
                      key={serviceZone.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      point={serviceZone}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                </g>
              ) : null}

              {layers.electrical ? (
                <g aria-label="Electrical layer">
                  {model.electricalBranches.map((branch) => (
                    <SelectableLine
                      className="electrical-branch"
                      key={branch.id}
                      line={branch}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                  {model.electricalNodes.map((node) => (
                    <SelectablePoint
                      className="electrical-node"
                      key={node.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      point={node}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                  {model.electricalSources.map((source) => (
                    <SelectablePoint
                      className="electrical-source"
                      key={source.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      point={source}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                  {model.electricalLoads.map((load) => (
                    <SelectablePoint
                      className="electrical-load"
                      key={load.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      point={load}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                </g>
              ) : null}

              {layers.tileLabels ? (
                <g aria-label="Tile label layer" pointerEvents="none">
                  {model.tiles.map((tile) => (
                    <g key={tile.id}>
                      <text className="tile-label" x={tile.center.x} y={tile.center.y - 8}>
                        {tile.label}
                      </text>
                      <text className="tile-id-label" x={tile.center.x} y={tile.center.y + 12}>
                        {tile.id}
                      </text>
                      <line
                        className="orientation-indicator"
                        x1={tile.center.x}
                        x2={tile.orientationEnd.x}
                        y1={tile.center.y}
                        y2={tile.orientationEnd.y}
                      />
                    </g>
                  ))}
                </g>
              ) : null}

              {layers.diagnostics ? (
                <g aria-label="Diagnostic layer">
                  {model.diagnostics.map((diagnostic) => (
                    <SelectableDiagnostic
                      diagnostic={diagnostic}
                      key={diagnostic.selection.id}
                      onKeyDown={handleObjectKeyDown}
                      onSelect={handleObjectSelect}
                      relatedKeys={selectedRelatedKeys}
                      selected={selection}
                    />
                  ))}
                </g>
              ) : null}
            </g>
          </svg>
        </div>

        <div className="scenario-map-sidepanel">
          <ScenarioMapDiagnostics
            diagnostics={model.diagnostics}
            onSelectDiagnostic={selectAndFocus}
            summary={model.diagnosticSummary}
          />
          <ScenarioMapDetails detail={selectedDetail} onSelect={selectAndFocus} />
        </div>
      </div>
    </section>
  );
}

function SelectableTile({
  onKeyDown,
  onSelect,
  relatedKeys,
  selected,
  tile,
}: {
  onKeyDown: (event: KeyboardEvent, selection: ScenarioSelection) => void;
  onSelect: (selection: ScenarioSelection) => void;
  relatedKeys: ReadonlySet<string>;
  selected: ScenarioSelection | null;
  tile: RenderTile;
}) {
  const stateClass = selectedStateClass(tile.selection, selected, relatedKeys);
  return (
    <polygon
      aria-label={describeSelection(tile.selection, `${tile.label} at ${tile.coordinateLabel}`)}
      className={`map-tile ${stateClass}`}
      data-selection-id={tile.id}
      data-testid={`tile-${tile.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(tile.selection);
      }}
      onKeyDown={(event) => onKeyDown(event, tile.selection)}
      points={tile.polygon}
      role="button"
      tabIndex={0}
    />
  );
}

function SelectableLine({
  className,
  line,
  onKeyDown,
  onSelect,
  relatedKeys,
  selected,
}: {
  className: string;
  line: RenderLine;
  onKeyDown: (event: KeyboardEvent, selection: ScenarioSelection) => void;
  onSelect: (selection: ScenarioSelection) => void;
  relatedKeys: ReadonlySet<string>;
  selected: ScenarioSelection | null;
}) {
  const stateClass = selectedStateClass(line.selection, selected, relatedKeys);
  return (
    <g
      aria-label={describeSelection(line.selection, line.label)}
      className={`selectable-line ${stateClass}`}
      data-testid={`${line.selection.kind}-${line.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(line.selection);
      }}
      onKeyDown={(event) => onKeyDown(event, line.selection)}
      role="button"
      tabIndex={0}
    >
      <line className={`${className} hit-stroke`} x1={line.from.x} x2={line.to.x} y1={line.from.y} y2={line.to.y} />
      <line className={className} x1={line.from.x} x2={line.to.x} y1={line.from.y} y2={line.to.y} />
    </g>
  );
}

function SelectablePoint({
  className,
  onKeyDown,
  onSelect,
  point,
  relatedKeys,
  selected,
}: {
  className: string;
  onKeyDown: (event: KeyboardEvent, selection: ScenarioSelection) => void;
  onSelect: (selection: ScenarioSelection) => void;
  point: RenderPoint;
  relatedKeys: ReadonlySet<string>;
  selected: ScenarioSelection | null;
}) {
  const stateClass = selectedStateClass(point.selection, selected, relatedKeys);
  return (
    <g
      aria-label={describeSelection(point.selection, point.label)}
      className={`selectable-point ${stateClass}`}
      data-testid={`${point.selection.kind}-${point.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(point.selection);
      }}
      onKeyDown={(event) => onKeyDown(event, point.selection)}
      role="button"
      tabIndex={0}
    >
      <circle className={`${className} point-hit`} cx={point.point.x} cy={point.point.y} r="15" />
      <circle className={className} cx={point.point.x} cy={point.point.y} r="7" />
      <text className="point-glyph" x={point.point.x} y={point.point.y + 4}>
        {glyphForPoint(point.kind)}
      </text>
    </g>
  );
}

function SelectableDiagnostic({
  diagnostic,
  onKeyDown,
  onSelect,
  relatedKeys,
  selected,
}: {
  diagnostic: MapDiagnostic;
  onKeyDown: (event: KeyboardEvent, selection: ScenarioSelection) => void;
  onSelect: (selection: ScenarioSelection) => void;
  relatedKeys: ReadonlySet<string>;
  selected: ScenarioSelection | null;
}) {
  const point = diagnostic.bounds
    ? {
        x: (diagnostic.bounds.minX + diagnostic.bounds.maxX) / 2,
        y: (diagnostic.bounds.minY + diagnostic.bounds.maxY) / 2,
      }
    : { x: 0, y: 0 };
  const stateClass = selectedStateClass(diagnostic.selection, selected, relatedKeys);

  return (
    <g
      aria-label={diagnosticLabel(diagnostic.label, diagnostic.severity, diagnostic.message)}
      className={`diagnostic-marker ${diagnostic.severity} ${stateClass}`}
      data-testid={`diagnostic-${diagnostic.selection.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(diagnostic.selection);
      }}
      onKeyDown={(event) => onKeyDown(event, diagnostic.selection)}
      role="button"
      tabIndex={0}
    >
      <rect height="22" rx="4" width="22" x={point.x - 11} y={point.y - 11} />
      <text x={point.x} y={point.y + 5}>
        !
      </text>
    </g>
  );
}

function selectedStateClass(
  candidate: ScenarioSelection,
  selected: ScenarioSelection | null,
  relatedKeys: ReadonlySet<string>,
): string {
  if (isSelected(selected, candidate)) {
    return "is-selected";
  }
  return relatedKeys.has(selectionKey(candidate)) ? "is-related" : "";
}

function glyphForPoint(kind: string): string {
  if (kind.includes("station")) {
    return "S";
  }
  if (kind.includes("passenger")) {
    return "P";
  }
  if (kind.includes("cargo")) {
    return "C";
  }
  if (kind.includes("charging") || kind.includes("source")) {
    return "E";
  }
  if (kind.includes("load")) {
    return "L";
  }
  return "N";
}

function pointerDistance(points: readonly { x: number; y: number }[]): number {
  if (points.length < 2 || !points[0] || !points[1]) {
    return 0;
  }
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function averageViewportPoint(
  points: readonly { x: number; y: number }[],
  rect: DOMRect,
): { x: number; y: number } {
  const sum = points.reduce(
    (current, point) => ({ x: current.x + point.x, y: current.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    x: sum.x / points.length - rect.left,
    y: sum.y / points.length - rect.top,
  };
}
