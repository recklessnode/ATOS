import type { EditorDiagnostic, EditorSelection } from "@atos/scenario-editor";

const CATEGORY_LABELS: Record<EditorDiagnostic["category"], string> = {
  placement: "Placement",
  guideway: "Guideway",
  electrical: "Electrical topology",
  stationService: "Station/service attachments",
  power: "Power integrity",
  recommendation: "Recommendation applicability",
  schema: "Scenario schema",
};

export function EditorDiagnostics({
  diagnostics,
  onSelect,
}: {
  diagnostics: readonly EditorDiagnostic[];
  onSelect: (selection: EditorSelection) => void;
}) {
  const grouped = groupDiagnostics(diagnostics);
  return (
    <section className="editor-panel" aria-label="Editor diagnostics">
      <h3>Diagnostics</h3>
      {diagnostics.length === 0 ? <p>No diagnostics for this draft.</p> : null}
      {Object.entries(grouped).map(([category, values]) => (
        <details key={category} open>
          <summary>{CATEGORY_LABELS[category as EditorDiagnostic["category"]]} ({values.length})</summary>
          <ul className="diagnostic-list">
            {values.map((diagnostic) => (
              <li className={diagnostic.severity} key={diagnostic.id}>
                <strong>{diagnostic.code.replaceAll("_", " ")}</strong>
                <span>{diagnostic.message}</span>
                <small>{diagnostic.blocking ? "Blocks commit" : "Advisory"}</small>
                <p>{diagnostic.remediation}</p>
                {diagnostic.target ? (
                  <button onClick={() => onSelect(diagnostic.target ?? null)} type="button">
                    Focus
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

function groupDiagnostics(diagnostics: readonly EditorDiagnostic[]): Partial<Record<EditorDiagnostic["category"], EditorDiagnostic[]>> {
  return diagnostics.reduce<Partial<Record<EditorDiagnostic["category"], EditorDiagnostic[]>>>((groups, diagnostic) => {
    groups[diagnostic.category] = [...(groups[diagnostic.category] ?? []), diagnostic];
    return groups;
  }, {});
}
