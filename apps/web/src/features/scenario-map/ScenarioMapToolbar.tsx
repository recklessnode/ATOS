export function ScenarioMapToolbar({
  canFocusSelected,
  onFit,
  onFocusDiagnostic,
  onFocusSelected,
  onFocusSource,
  onFocusStation,
  onReset,
  onZoomIn,
  onZoomOut,
}: {
  canFocusSelected: boolean;
  onFit: () => void;
  onFocusDiagnostic: () => void;
  onFocusSelected: () => void;
  onFocusSource: () => void;
  onFocusStation: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="scenario-map-toolbar" aria-label="Map view controls">
      <button aria-label="Zoom in" onClick={onZoomIn} type="button">
        +
      </button>
      <button aria-label="Zoom out" onClick={onZoomOut} type="button">
        -
      </button>
      <button onClick={onFit} type="button">
        Fit all
      </button>
      <button onClick={onReset} type="button">
        Reset
      </button>
      <button disabled={!canFocusSelected} onClick={onFocusSelected} type="button">
        Focus selected
      </button>
      <button onClick={onFocusStation} type="button">
        Focus station
      </button>
      <button onClick={onFocusSource} type="button">
        Focus source
      </button>
      <button onClick={onFocusDiagnostic} type="button">
        Focus diagnostic
      </button>
    </div>
  );
}
