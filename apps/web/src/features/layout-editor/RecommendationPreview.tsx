import type { EditorSelection, EditorState } from "@atos/scenario-editor";

export function RecommendationPreview({
  editor,
  onAccept,
  onPreview,
  onReject,
  onSelect,
}: {
  editor: EditorState;
  onAccept: () => void;
  onPreview: (recommendationId: string) => void;
  onReject: () => void;
  onSelect: (selection: EditorSelection) => void;
}) {
  return (
    <section className="editor-panel" aria-label="Recommendation preview">
      <h3>Power Recommendations</h3>
      {editor.derived.powerAnalysis.recommendations.length === 0 ? (
        <p>No improving recommendation for this draft and preset.</p>
      ) : (
        <ol className="recommendation-list">
          {editor.derived.powerAnalysis.recommendations.slice(0, 5).map((recommendation) => {
            const targetId = recommendation.targetId;
            return (
              <li key={recommendation.id}>
                <strong>{recommendation.proposedChange}</strong>
                <span>{recommendation.observedDeficiency}</span>
                <small>Score {Math.round(recommendation.score.total * 100) / 100}; {recommendation.confidence} confidence</small>
                <div className="inline-actions">
                  <button onClick={() => onPreview(recommendation.id)} type="button">Preview</button>
                  {targetId ? (
                    <button onClick={() => onSelect(targetFromRecommendation(recommendation.targetKind, targetId))} type="button">
                      Focus
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {editor.preview ? (
        <div className="preview-panel">
          <h4>{editor.preview.label}</h4>
          <p>{editor.preview.executable ? "Executable scenario preview." : editor.preview.reason}</p>
          <div className="inline-actions">
            <button disabled={!editor.preview.executable} onClick={onAccept} type="button">Accept Preview</button>
            <button onClick={onReject} type="button">Reject Preview</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Before</th>
                <th>After</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {editor.preview.comparison.metrics.map((metric) => (
                <tr key={metric.id}>
                  <th scope="row">{metric.label}</th>
                  <td>{formatMetric(metric.before, metric.unit)}</td>
                  <td>{formatMetric(metric.after, metric.unit)}</td>
                  <td>{metric.delta === undefined ? "n/a" : formatMetric(metric.delta, metric.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="changed-ids">
            Changed tiles: {editor.preview.comparison.changedTiles.join(", ") || "none"}; changed loads:{" "}
            {editor.preview.comparison.changedLoads.join(", ") || "none"}.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function targetFromRecommendation(kind: string | undefined, id: string): EditorSelection {
  switch (kind) {
    case "branch":
      return { kind: "electricalBranch", id };
    case "source":
      return { kind: "electricalSource", id };
    case "load":
      return { kind: "electricalLoad", id };
    case "tile":
      return { kind: "tile", id };
    case "setPiece":
      return { kind: "setPiece", id };
    case "node":
    default:
      return { kind: "electricalNode", id };
  }
}

function formatMetric(value: number | string | undefined, unit?: string): string {
  if (value === undefined) {
    return "n/a";
  }
  if (typeof value === "number") {
    return `${value}${unit ? ` ${unit}` : ""}`;
  }
  return value;
}
