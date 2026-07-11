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

export type PowerOverlayMode =
  | "voltage"
  | "current"
  | "voltage_drop"
  | "branch_utilization"
  | "power_loss"
  | "load_state";

export type ScenarioMapFocusRequest = {
  selection: ScenarioSelection;
  requestId: number;
};

type PointerTracker = {
  lastPoint: { x: number; y: number } | null;
  lastSvgPoint: { x: number; y: number } | null;
  moved: boolean;
  pointers: Map<number, { x: number; y: number }>;
  pinchDistance: number | null;
};

export function ScenarioMap({
  ariaLabel = "Layout workspace",
  focusRequest,
  headingDescription = "Read-only SVG inspection of the deterministic six-tile scenario, extracted guideway graph, station services, electrical graph, and diagnostics.",
  headingStatus = "Layout",
  headingTitle = "Scenario Map Inspector",
  model: providedModel,
  powerOverlayMode = "voltage",
  sectionId = "layout",
}: {
  ariaLabel?: string;
  focusRequest?: ScenarioMapFocusRequest;
  headingDescription?: string;
  headingStatus?: string;
  headingTitle?: string;
  model?: ScenarioMapRenderModel;
  powerOverlayMode?: PowerOverlayMode;
  sectionId?: string;
}) {
  const fixtureModel = useMemo(() => buildSixTileScenarioMapModel(), []);
  const model = providedModel ?? fixtureModel;
  const [layers, setLayers] = useState(() =>
    model.powerAnalysis ? { ...model.layers, electrical: true } : model.layers,
  );
  const initialSelection = focusRequest?.selection ?? null;
  const [selection, setSelection] = useState<ScenarioSelection | null>(initialSelection);
  const initialView = useMemo(() => {
    const focusBounds = initialSelection ? model.boundsByKey.get(selectionKey(initialSelection)) : undefined;
    const fitted = initialViewState(model.bounds, DEFAULT_VIEWPORT);
    return focusBounds ? reduceViewState(fitted, { type: "focus", bounds: focusBounds, viewport: DEFAULT_VIEWPORT }) : fitted;
  }, [initialSelection, model.bounds, model.boundsByKey]);
  const [view, dispatchView] = useReducer(reduceViewState, initialView);
  const tracker = useRef<PointerTracker>({
    lastPoint: null,
    lastSvgPoint: null,
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
    dispatchView({
      type: "zoom",
      viewportPoint: clientPointToSvgPoint(event.currentTarget, { x: event.clientX, y: event.clientY }),
      scaleMultiplier: event.deltaY < 0 ? 1.12 : 0.88,
    });
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    const point = { x: event.clientX, y: event.clientY };
    tracker.current.pointers.set(event.pointerId, point);
    tracker.current.lastPoint = point;
    tracker.current.lastSvgPoint = clientPointToSvgPoint(event.currentTarget, point);
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
          viewportPoint: averageSvgPoint(points, event.currentTarget),
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
    const nextSvgPoint = clientPointToSvgPoint(event.currentTarget, nextPoint);
    const lastSvgPoint = tracker.current.lastSvgPoint ?? clientPointToSvgPoint(event.currentTarget, lastPoint);
    const delta = { x: nextSvgPoint.x - lastSvgPoint.x, y: nextSvgPoint.y - lastSvgPoint.y };
    if (Math.abs(delta.x) > 0 || Math.abs(delta.y) > 0) {
      tracker.current.moved = true;
      dispatchView({ type: "pan", delta });
    }
    tracker.current.lastPoint = nextPoint;
    tracker.current.lastSvgPoint = nextSvgPoint;
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>): void {
    tracker.current.pointers.delete(event.pointerId);
    tracker.current.pinchDistance = null;
    if (!tracker.current.moved && event.target === event.currentTarget) {
      setSelection(null);
    }
    tracker.current.lastPoint = null;
    tracker.current.lastSvgPoint = null;
  }

  function firstDiagnosticSelection(): ScenarioSelection | undefined {
    return model.focusTargets.firstDiagnostic ?? model.diagnostics[0]?.selection;
  }

  const focusDiagnosticTarget = firstDiagnosticSelection();

  return (
    <section className="scenario-map-workspace" id={sectionId} aria-label={ariaLabel}>
      <div className="scenario-map-heading">
        <div>
          <p className="workspace-status">{headingStatus}</p>
          <h2>{headingTitle}</h2>
        </div>
        <p>{headingDescription}</p>
      </div>

      <div className="scenario-map-shell" onKeyDown={handleMapKeyDown}>
        <div className="scenario-map-main">
          <ScenarioMapToolbar
            canFocusSelected={Boolean(selection)}
            canFocusDiagnostic={Boolean(focusDiagnosticTarget)}
            onFit={() => dispatchView({ type: "fit", bounds: model.bounds, viewport: DEFAULT_VIEWPORT })}
            onFocusDiagnostic={() => {
              if (focusDiagnosticTarget) {
                selectAndFocus(focusDiagnosticTarget);
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
            role="group"
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

              {layers.electrical && model.powerAnalysis ? (
                <PowerOverlay
                  mode={powerOverlayMode}
                  model={model}
                  onKeyDown={handleObjectKeyDown}
                  onSelect={handleObjectSelect}
                  relatedKeys={selectedRelatedKeys}
                  selected={selection}
                />
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

function PowerOverlay({
  mode,
  model,
  onKeyDown,
  onSelect,
  relatedKeys,
  selected,
}: {
  mode: PowerOverlayMode;
  model: ScenarioMapRenderModel;
  onKeyDown: (event: KeyboardEvent, selection: ScenarioSelection) => void;
  onSelect: (selection: ScenarioSelection) => void;
  relatedKeys: ReadonlySet<string>;
  selected: ScenarioSelection | null;
}) {
  const analysis = model.powerAnalysis;
  if (!analysis) {
    return null;
  }

  const branchById = new Map(analysis.branches.map((branch) => [branch.id, branch]));
  const nodeById = new Map(analysis.nodes.map((node) => [node.id, node]));
  const loadById = new Map(analysis.loads.map((load) => [load.id, load]));
  const sourceById = new Map(analysis.sources.map((source) => [source.id, source]));

  return (
    <g aria-label={`Power ${mode.replaceAll("_", " ")} overlay`} className={`power-overlay mode-${mode}`}>
      {model.electricalBranches.map((line) => {
        const branch = branchById.get(line.id);
        if (!branch) {
          return null;
        }
        const selection = { kind: "electricalBranch", id: line.id } as const;
        const stateClass = selectedStateClass(selection, selected, relatedKeys);
        const midpoint = { x: (line.from.x + line.to.x) / 2, y: (line.from.y + line.to.y) / 2 };
        return (
          <g
            aria-label={`Power branch ${line.id}: ${powerBranchLabel(branch, mode)}`}
            className={`power-trace-group ${branch.state} ${stateClass}`}
            data-testid={`power-branch-${line.id}`}
            key={line.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(selection);
            }}
            onKeyDown={(event) => onKeyDown(event, selection)}
            role="button"
            tabIndex={0}
          >
            <line className="hit-stroke" x1={line.from.x} x2={line.to.x} y1={line.from.y} y2={line.to.y} />
            <line
              className="power-trace"
              strokeWidth={powerTraceWidth(branch.utilization, mode)}
              x1={line.from.x}
              x2={line.to.x}
              y1={line.from.y}
              y2={line.to.y}
            />
            <text className="power-trace-label" x={midpoint.x} y={midpoint.y - 9}>
              {powerBranchLabel(branch, mode)}
            </text>
            <text className="power-arrow-label" x={midpoint.x} y={midpoint.y + 12}>
              {branch.currentAmps >= 0 ? "->" : "<-"}
            </text>
          </g>
        );
      })}

      {model.electricalNodes.map((point) => {
        const node = nodeById.get(point.id);
        return node ? (
          <text className="power-node-label" key={point.id} x={point.point.x} y={point.point.y - 12}>
            {formatValue(node.voltage)} V
          </text>
        ) : null;
      })}

      {model.electricalSources.map((point) => {
        const source = sourceById.get(point.id);
        return source ? (
          <text className="power-source-label" key={point.id} x={point.point.x} y={point.point.y - 14}>
            {formatValue(source.utilization * 100)}%
          </text>
        ) : null;
      })}

      {model.electricalLoads.map((point) => {
        const load = loadById.get(point.id);
        if (!load) {
          return null;
        }
        const selection = { kind: "electricalLoad", id: point.id } as const;
        return (
          <g
            aria-label={`Power load ${point.id}: ${load.state}, tier ${load.consumerTier}, ${formatValue(load.deliveredWatts)} W delivered`}
            className={`power-load-state ${load.state} tier-${load.consumerTier}`}
            data-testid={`power-load-${point.id}`}
            key={point.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(selection);
            }}
            onKeyDown={(event) => onKeyDown(event, selection)}
            role="button"
            tabIndex={0}
          >
            <circle cx={point.point.x} cy={point.point.y} r="13" />
            <text x={point.point.x} y={point.point.y + 4}>
              {load.state === "served" ? `T${load.consumerTier}` : "!"}
            </text>
          </g>
        );
      })}

      {analysis.findings.slice(0, 8).map((finding) => {
        const target = selectionForPowerTarget(finding.targetKind, finding.targetId);
        const bounds = target ? model.boundsByKey.get(selectionKey(target)) : undefined;
        if (!target || !bounds) {
          return null;
        }
        const x = (bounds.minX + bounds.maxX) / 2;
        const y = (bounds.minY + bounds.maxY) / 2;
        return (
          <g
            aria-label={`Power finding: ${finding.label}. ${finding.explanation}`}
            className={`power-finding-marker ${finding.severity}`}
            data-testid={`power-finding-${finding.id}`}
            key={finding.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(target);
            }}
            onKeyDown={(event) => onKeyDown(event, target)}
            role="button"
            tabIndex={0}
          >
            <rect height="20" width="20" x={x - 10} y={y - 10} />
            <text x={x} y={y + 5}>
              F
            </text>
          </g>
        );
      })}

      {analysis.recommendations.slice(0, 5).map((recommendation) => {
        const target = selectionForPowerTarget(recommendation.targetKind, recommendation.targetId);
        const bounds = target ? model.boundsByKey.get(selectionKey(target)) : undefined;
        if (!target || !bounds) {
          return null;
        }
        const x = (bounds.minX + bounds.maxX) / 2 + 18;
        const y = (bounds.minY + bounds.maxY) / 2 - 18;
        return (
          <g
            aria-label={`Power recommendation: ${recommendation.proposedChange}`}
            className="power-recommendation-marker"
            data-testid={`power-recommendation-${recommendation.id}`}
            key={recommendation.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(target);
            }}
            onKeyDown={(event) => onKeyDown(event, target)}
            role="button"
            tabIndex={0}
          >
            <circle cx={x} cy={y} r="11" />
            <text x={x} y={y + 5}>
              R
            </text>
          </g>
        );
      })}
    </g>
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

function averageSvgPoint(
  points: readonly { x: number; y: number }[],
  svg: SVGSVGElement,
): { x: number; y: number } {
  const sum = points.reduce(
    (current, point) => ({ x: current.x + point.x, y: current.y + point.y }),
    { x: 0, y: 0 },
  );
  return clientPointToSvgPoint(svg, { x: sum.x / points.length, y: sum.y / points.length });
}

function clientPointToSvgPoint(svg: SVGSVGElement, point: { x: number; y: number }): { x: number; y: number } {
  const screenMatrix = svg.getScreenCTM?.();
  if (screenMatrix && typeof DOMPoint === "function") {
    const svgPoint = new DOMPoint(point.x, point.y).matrixTransform(screenMatrix.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return {
      x: ((point.x - rect.left) / rect.width) * DEFAULT_VIEWPORT.width,
      y: ((point.y - rect.top) / rect.height) * DEFAULT_VIEWPORT.height,
    };
  }

  return { x: point.x - rect.left, y: point.y - rect.top };
}

function powerTraceWidth(utilization: number, mode: PowerOverlayMode): number {
  if (mode === "branch_utilization" || mode === "current") {
    return Math.max(4, Math.min(14, 4 + utilization * 8));
  }
  return 5;
}

function powerBranchLabel(
  branch: NonNullable<ScenarioMapRenderModel["powerAnalysis"]>["branches"][number],
  mode: PowerOverlayMode,
): string {
  switch (mode) {
    case "voltage":
      return `${formatValue(branch.voltageDrop)} V drop`;
    case "current":
      return `${formatValue(branch.currentAmps)} A`;
    case "voltage_drop":
      return `${formatValue(branch.voltageDrop)} V`;
    case "branch_utilization":
      return `${formatValue(branch.utilization * 100)}%`;
    case "power_loss":
      return `${formatValue(branch.powerLossWatts)} W loss`;
    case "load_state":
      return branch.state;
  }
}

function selectionForPowerTarget(
  kind: string | undefined,
  id: string | undefined,
): ScenarioSelection | null {
  if (!kind || !id) {
    return null;
  }
  if (kind === "node") {
    return { kind: "electricalNode", id };
  }
  if (kind === "branch") {
    return { kind: "electricalBranch", id };
  }
  if (kind === "source") {
    return { kind: "electricalSource", id };
  }
  if (kind === "load") {
    return { kind: "electricalLoad", id };
  }
  if (kind === "tile") {
    return { kind: "tile", id };
  }
  if (kind === "setPiece") {
    return { kind: "setPiece", id };
  }
  return null;
}

function formatValue(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "n/a";
}
