import type { DiagnosticCategory, DiagnosticSummary, MapDiagnostic } from "./render-model";
import type { ScenarioSelection } from "./selection";

const LABELS: Record<DiagnosticCategory, string> = {
  duplicateTileOccupancy: "Duplicate tile occupancy",
  missingDefinition: "Missing definitions",
  openGuidewayEnd: "Open guideway ends",
  incompatibleGuidewayConnection: "Incompatible guideway",
  disconnectedGuidewayComponent: "Disconnected guideway components",
  openElectricalConnector: "Open electrical connectors",
  incompatibleElectricalConnection: "Incompatible electrical",
  extractionError: "Extraction errors",
};

export function ScenarioMapDiagnostics({
  diagnostics,
  onSelectDiagnostic,
  summary,
}: {
  diagnostics: readonly MapDiagnostic[];
  onSelectDiagnostic: (selection: ScenarioSelection) => void;
  summary: DiagnosticSummary;
}) {
  return (
    <section className="scenario-map-diagnostics" aria-label="Map diagnostics">
      <h3>Diagnostics</h3>
      <p>
        A single guideway component is expected for this fixture. Open connectors are reported as
        warnings until intentional terminus metadata exists.
      </p>
      <div className="diagnostic-grid">
        {(Object.keys(LABELS) as DiagnosticCategory[]).map((category) => {
          const count = summary[category];
          const first = diagnostics.find((diagnostic) => diagnostic.category === category);
          return (
            <button
              aria-label={`${LABELS[category]}: ${count}`}
              disabled={count === 0 || !first}
              key={category}
              onClick={() => first && onSelectDiagnostic(first.selection)}
              type="button"
            >
              <span>{LABELS[category]}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}
