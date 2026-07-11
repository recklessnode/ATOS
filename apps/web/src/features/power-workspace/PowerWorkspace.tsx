import { useMemo, useRef, useState } from "react";
import {
  analyzePowerNetwork,
  applyPowerPreset,
  POWER_PRESETS,
  POWER_TIER_LABELS,
  type PowerAnalysisResult,
  type PowerPresetId,
  type PowerRecommendation,
} from "@atos/power";
import { loadSixTileCityFixture } from "@atos/scenario";
import {
  ScenarioMap,
  type PowerOverlayMode,
  type ScenarioMapFocusRequest,
} from "../scenario-map";
import { buildScenarioMapRenderModel } from "../scenario-map/render-model";
import type { ScenarioSelection } from "../scenario-map/selection";
import "./PowerWorkspace.css";

const OVERLAY_MODES = [
  { id: "voltage", label: "Voltage" },
  { id: "current", label: "Current" },
  { id: "voltage_drop", label: "Voltage drop" },
  { id: "branch_utilization", label: "Branch utilization" },
  { id: "power_loss", label: "Power loss" },
  { id: "load_state", label: "Load state" },
] as const satisfies readonly { id: PowerOverlayMode; label: string }[];

const DEFAULT_PRESET_ID: PowerPresetId = "normal_operations";
const DEFAULT_OVERLAY_MODE: PowerOverlayMode = "voltage";

export function PowerWorkspace() {
  const document = useMemo(() => loadSixTileCityFixture(), []);
  const focusRequestId = useRef(0);
  const [presetId, setPresetId] = useState<PowerPresetId>(() => readInitialPresetId());
  const [overlayMode, setOverlayMode] = useState<PowerOverlayMode>(() => readInitialOverlayMode());
  const [focusRequest, setFocusRequest] = useState<ScenarioMapFocusRequest | undefined>();
  const powerInput = useMemo(() => applyPowerPreset(document.electrical, presetId), [document, presetId]);
  const analysis = useMemo(() => analyzePowerNetwork(powerInput), [powerInput]);
  const mapModel = useMemo(() => {
    const baseModel = buildScenarioMapRenderModel(document, { powerAnalysis: analysis });
    return { ...baseModel, layers: { ...baseModel.layers, electrical: true } };
  }, [analysis, document]);

  function focusSelection(selection: ScenarioSelection | null): void {
    if (selection) {
      focusRequestId.current += 1;
      setFocusRequest({ selection, requestId: focusRequestId.current });
    }
  }

  return (
    <section className="power-workspace" id="power" aria-label="Power workspace">
      <div className="power-heading">
        <div>
          <p className="workspace-status">Power</p>
          <h2>DC Power Integrity</h2>
        </div>
        <p>
          Deterministic nodal analysis of the extracted electrical graph with consumer tiers,
          brownout handling, load shedding, bad-layout findings, and advisory improvements.
        </p>
      </div>

      <div className="power-controls">
        <label>
          Operating preset
          <select value={presetId} onChange={(event) => setPresetId(event.target.value as PowerPresetId)}>
            {POWER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>PCB overlay</legend>
          {OVERLAY_MODES.map((mode) => (
            <label key={mode.id}>
              <input
                checked={overlayMode === mode.id}
                name="power-overlay-mode"
                onChange={() => setOverlayMode(mode.id)}
                type="radio"
              />
              {mode.label}
            </label>
          ))}
        </fieldset>
      </div>

      <PowerSummary analysis={analysis} />
      <TierSummary analysis={analysis} />

      <div className="power-map-panel">
        <ScenarioMap
          ariaLabel="Power scenario map"
          focusRequest={focusRequest}
          headingDescription="Read-only SVG inspection with electrical layers and PCB-style power overlays for the selected operating preset."
          headingStatus="Power map"
          headingTitle="Power Scenario Map"
          key={focusRequest?.requestId ?? "power-map"}
          model={mapModel}
          powerOverlayMode={overlayMode}
          sectionId="power-map"
        />
      </div>

      <div className="power-analysis-grid">
        <DiagnosticsPanel analysis={analysis} />
        <FindingsPanel analysis={analysis} onFocus={focusSelection} />
        <RecommendationsPanel analysis={analysis} onFocus={focusSelection} />
      </div>

      <PowerTables analysis={analysis} onFocus={focusSelection} />
    </section>
  );
}

function PowerSummary({ analysis }: { analysis: PowerAnalysisResult }) {
  const source = analysis.sources[0];
  return (
    <section className="power-summary" aria-label="Power integrity summary">
      <MetricCard label="Network state" value={analysis.metrics.networkState.replaceAll("_", " ")} />
      <MetricCard
        label="Source utilization"
        value={`${formatNumber((source?.utilization ?? 0) * 100)}%`}
        detail={`${formatNumber(source?.deliveredWatts ?? 0)} W / ${formatNumber(source?.maximumWatts ?? 0)} W`}
      />
      <MetricCard
        label="Requested / delivered"
        value={`${formatNumber(analysis.metrics.totalRequestedLoadWatts)} W / ${formatNumber(analysis.metrics.totalDeliveredLoadWatts)} W`}
      />
      <MetricCard label="Conductor loss" value={`${formatNumber(analysis.metrics.totalConductorLossWatts)} W`} />
      <MetricCard label="Minimum voltage" value={`${formatNumber(analysis.metrics.minimumNodeVoltage)} V`} />
      <MetricCard label="Worst branch" value={`${formatNumber(analysis.metrics.worstBranchUtilization * 100)}%`} detail={analysis.metrics.worstBranchId ?? "n/a"} />
      <MetricCard label="Shed load" value={`${analysis.metrics.shedLoadCount} loads`} detail={`${formatNumber(analysis.metrics.shedWatts)} W`} />
      <MetricCard label="Convergence" value={analysis.metrics.converged ? "converged" : "failed"} detail={`${analysis.metrics.iterationCount} iterations`} />
    </section>
  );
}

function MetricCard({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <article className="power-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

function TierSummary({ analysis }: { analysis: PowerAnalysisResult }) {
  const protectedShortfall = analysis.highestProtectedTierNotFullyServed;
  return (
    <section className="power-panel" aria-label="Consumer tier summary">
      <div className="power-panel-heading">
        <h3>Consumer Tiers</h3>
        <p>
          Safety preserved: {analysis.safetyPreserved ? "yes" : "no"}; control preserved:{" "}
          {analysis.controlPreserved ? "yes" : "no"}; mobility preserved:{" "}
          {analysis.mobilityPreserved ? "yes" : "no"}; highest protected shortfall:{" "}
          {protectedShortfall === undefined ? "none" : POWER_TIER_LABELS[protectedShortfall]}.
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Requested</th>
              <th>Delivered</th>
              <th>Shed</th>
              <th>Undervoltage</th>
            </tr>
          </thead>
          <tbody>
            {analysis.tierSummaries.map((tier) => (
              <tr key={tier.tier}>
                <th scope="row">{tier.label}</th>
                <td>{formatNumber(tier.requestedWatts)} W</td>
                <td>{formatNumber(tier.deliveredWatts)} W</td>
                <td>{formatNumber(tier.shedWatts)} W</td>
                <td>{formatNumber(tier.undervoltageWatts)} W</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiagnosticsPanel({ analysis }: { analysis: PowerAnalysisResult }) {
  return (
    <section className="power-panel" aria-label="Power diagnostics">
      <h3>Diagnostics</h3>
      {analysis.diagnostics.length === 0 ? (
        <p>No power diagnostics for this preset.</p>
      ) : (
        <ul className="power-list">
          {analysis.diagnostics.map((diagnostic) => (
            <li className={diagnostic.severity} key={diagnostic.id}>
              <strong>{diagnostic.code.replaceAll("_", " ")}</strong>
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FindingsPanel({
  analysis,
  onFocus,
}: {
  analysis: PowerAnalysisResult;
  onFocus: (selection: ScenarioSelection | null) => void;
}) {
  return (
    <section className="power-panel" aria-label="Bad-layout findings">
      <h3>Bad-Layout Findings</h3>
      {analysis.findings.length === 0 ? (
        <p>No weak-layout findings for this preset.</p>
      ) : (
        <ul className="power-list">
          {analysis.findings.map((finding) => (
            <li className={finding.severity} key={finding.id}>
              <strong>{finding.label}</strong>
              <span>{finding.explanation}</span>
              <button onClick={() => onFocus(selectionForPowerTarget(finding.targetKind, finding.targetId))} type="button">
                Focus target
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecommendationsPanel({
  analysis,
  onFocus,
}: {
  analysis: PowerAnalysisResult;
  onFocus: (selection: ScenarioSelection | null) => void;
}) {
  return (
    <section className="power-panel" aria-label="Ranked power recommendations">
      <h3>Recommendations</h3>
      {analysis.recommendations.length === 0 ? (
        <p>No improving recommendation was found for this preset.</p>
      ) : (
        <ol className="power-recommendations">
          {analysis.recommendations.map((recommendation) => (
            <li key={recommendation.id}>
              <RecommendationCard recommendation={recommendation} onFocus={onFocus} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RecommendationCard({
  onFocus,
  recommendation,
}: {
  onFocus: (selection: ScenarioSelection | null) => void;
  recommendation: PowerRecommendation;
}) {
  return (
    <article>
      <div>
        <strong>{recommendation.proposedChange}</strong>
        <span>Score {formatNumber(recommendation.score.total)} · {recommendation.confidence} confidence</span>
      </div>
      <p>{recommendation.explanation}</p>
      {recommendation.preview ? (
        <dl>
          <div>
            <dt>Minimum voltage</dt>
            <dd>
              {formatNumber(recommendation.preview.before.minimumNodeVoltage)} V {"->"}{" "}
              {formatNumber(recommendation.preview.after.minimumNodeVoltage)} V
            </dd>
          </div>
          <div>
            <dt>Worst branch</dt>
            <dd>
              {formatNumber(recommendation.preview.before.worstBranchUtilization * 100)}% {"->"}{" "}
              {formatNumber(recommendation.preview.after.worstBranchUtilization * 100)}%
            </dd>
          </div>
          <div>
            <dt>Unserved</dt>
            <dd>
              {formatNumber(recommendation.preview.before.unservedWatts)} W {"->"}{" "}
              {formatNumber(recommendation.preview.after.unservedWatts)} W
            </dd>
          </div>
        </dl>
      ) : null}
      <button onClick={() => onFocus(selectionForPowerTarget(recommendation.targetKind, recommendation.targetId))} type="button">
        Focus affected object
      </button>
    </article>
  );
}

function PowerTables({
  analysis,
  onFocus,
}: {
  analysis: PowerAnalysisResult;
  onFocus: (selection: ScenarioSelection | null) => void;
}) {
  return (
    <div className="power-table-grid">
      <ResultTable
        columns={["Node", "Voltage", "Loads", "Sources"]}
        label="Node voltage table"
        rows={analysis.nodes.map((node) => ({
          id: node.id,
          cells: [
            node.id,
            `${formatNumber(node.voltage)} V`,
            node.attachedLoadIds.join(", ") || "none",
            node.attachedSourceIds.join(", ") || "none",
          ],
          selection: { kind: "electricalNode", id: node.id },
        }))}
        onFocus={onFocus}
      />
      <ResultTable
        columns={["Branch", "Current", "Utilization", "Loss", "State"]}
        label="Branch current table"
        rows={analysis.branches.map((branch) => ({
          id: branch.id,
          cells: [
            branch.id,
            `${formatNumber(branch.currentAmps)} A`,
            `${formatNumber(branch.utilization * 100)}%`,
            `${formatNumber(branch.powerLossWatts)} W`,
            branch.state,
          ],
          selection: { kind: "electricalBranch", id: branch.id },
        }))}
        onFocus={onFocus}
      />
      <ResultTable
        columns={["Load", "Tier", "Requested", "Delivered", "State"]}
        label="Load service table"
        rows={analysis.loads.map((load) => ({
          id: load.id,
          cells: [
            load.id,
            `Tier ${load.consumerTier}`,
            `${formatNumber(load.requestedWatts)} W`,
            `${formatNumber(load.deliveredWatts)} W`,
            load.state,
          ],
          selection: { kind: "electricalLoad", id: load.id },
        }))}
        onFocus={onFocus}
      />
      <ResultTable
        columns={["Source", "Watts", "Utilization", "Headroom"]}
        label="Source utilization table"
        rows={analysis.sources.map((source) => ({
          id: source.id,
          cells: [
            source.id,
            `${formatNumber(source.deliveredWatts)} W`,
            `${formatNumber(source.utilization * 100)}%`,
            `${formatNumber(source.wattageHeadroom)} W`,
          ],
          selection: { kind: "electricalSource", id: source.id },
        }))}
        onFocus={onFocus}
      />
    </div>
  );
}

function ResultTable({
  columns,
  label,
  onFocus,
  rows,
}: {
  columns: string[];
  label: string;
  onFocus: (selection: ScenarioSelection | null) => void;
  rows: { id: string; cells: string[]; selection: ScenarioSelection }[];
}) {
  return (
    <section className="power-panel" aria-label={label}>
      <h3>{label.replace(" table", "")}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th>Map</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) =>
                  index === 0 ? <th key={cell} scope="row">{cell}</th> : <td key={`${row.id}:${index}`}>{cell}</td>,
                )}
                <td>
                  <button onClick={() => onFocus(row.selection)} type="button">
                    Focus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "n/a";
}

function readInitialPresetId(): PowerPresetId {
  if (typeof window === "undefined") {
    return DEFAULT_PRESET_ID;
  }
  const value = new URLSearchParams(window.location.search).get("powerPreset");
  return isPowerPresetId(value) ? value : DEFAULT_PRESET_ID;
}

function readInitialOverlayMode(): PowerOverlayMode {
  if (typeof window === "undefined") {
    return DEFAULT_OVERLAY_MODE;
  }
  const value = new URLSearchParams(window.location.search).get("powerOverlay");
  return isPowerOverlayMode(value) ? value : DEFAULT_OVERLAY_MODE;
}

function isPowerPresetId(value: string | null): value is PowerPresetId {
  return POWER_PRESETS.some((preset) => preset.id === value);
}

function isPowerOverlayMode(value: string | null): value is PowerOverlayMode {
  return OVERLAY_MODES.some((mode) => mode.id === value);
}
