import { useMemo, useRef, useState } from "react";
import {
  createDispatchPlannerInput,
  generateSeededDispatchDemand,
  planDispatch,
  type DeficiencyGate,
  type DispatchAsset,
  type DispatchPlannerResult,
  type DispatchReservation,
  type InfrastructureRecommendation,
  type MissionPlan,
  type TransientSuperWorker,
} from "@atos/dispatch";
import { loadSixTileCityFixture, type ScenarioDocumentV1 } from "@atos/scenario";
import {
  ScenarioMap,
  type ScenarioMapFocusRequest,
} from "../scenario-map";
import { buildScenarioMapRenderModel, type ScenarioMapRenderModel } from "../scenario-map/render-model";
import { selectionKey, type ScenarioSelection } from "../scenario-map/selection";
import "./DispatchWorkspace.css";

type DispatchWorkspaceProps = {
  documentOverride?: ScenarioDocumentV1;
};

export function DispatchWorkspace({ documentOverride }: DispatchWorkspaceProps) {
  const document = useMemo(() => documentOverride ?? loadSixTileCityFixture(), [documentOverride]);
  const focusRequestId = useRef(0);
  const [focusRequest, setFocusRequest] = useState<ScenarioMapFocusRequest | undefined>();
  const plannerInput = useMemo(() => createDispatchPlannerInput(document), [document]);
  const result = useMemo(() => planDispatch(plannerInput), [plannerInput]);
  const seededDemand = useMemo(() =>
    generateSeededDispatchDemand({
      seed: document.randomSeed,
      count: 4,
      currentTime: document.simulation.currentTime,
      stationId: document.stations[0]?.id ?? "station",
      serviceZoneIds: document.serviceZones.map((zone) => zone.id),
    }),
  [document]);
  const mapModel = useMemo(() => {
    const baseModel = buildScenarioMapRenderModel(document, { powerAnalysis: plannerInput.powerAnalysis });
    return { ...baseModel, layers: { ...baseModel.layers, electrical: true } };
  }, [document, plannerInput.powerAnalysis]);

  function focusSelection(selection: ScenarioSelection | null): void {
    if (selection) {
      focusRequestId.current += 1;
      setFocusRequest({ selection, requestId: focusRequestId.current });
    }
  }

  function focusByIds(ids: readonly string[]): void {
    focusSelection(selectionForIds(ids, mapModel, result.assets));
  }

  return (
    <section className="dispatch-workspace" id="dispatch" aria-label="Dispatch workspace">
      <div className="dispatch-heading">
        <div>
          <p className="workspace-status">Dispatch</p>
          <h2>Dispatch Planning Core</h2>
        </div>
        <p>
          Deterministic planning over universal chits, persistent assets, workers, transient
          super-workers, reservations, power launch gates, and deficiency recommendations.
        </p>
      </div>

      <DispatchSummary result={result} />

      <div className="dispatch-map-panel">
        <ScenarioMap
          ariaLabel="Dispatch scenario map"
          focusRequest={focusRequest}
          headingDescription="Read-only scenario focus for dispatch plans, reserved guideway resources, service zones, and power-gate diagnostics."
          headingStatus="Dispatch map"
          headingTitle="Dispatch Scenario Map"
          key={focusRequest?.requestId ?? "dispatch-map"}
          model={mapModel}
          sectionId="dispatch-map"
        />
      </div>

      <div className="dispatch-grid">
        <QueuePanel result={result} onFocus={focusByIds} />
        <InventoryPanel result={result} onFocus={focusByIds} />
        <WorkerPanel result={result} />
        <ConsistPanel result={result} />
      </div>

      <div className="dispatch-grid dispatch-grid-wide">
        <MissionPanel result={result} onFocus={focusByIds} />
        <ReservationPanel result={result} onFocus={focusByIds} />
      </div>

      <div className="dispatch-grid dispatch-grid-wide">
        <DeficiencyPanel result={result} onFocus={focusByIds} />
        <RecommendationPanel recommendations={result.recommendations} onFocus={focusByIds} />
      </div>

      <div className="dispatch-grid">
        <ScorePanel result={result} />
        <SeededDemandPanel chits={seededDemand} />
      </div>
    </section>
  );
}

function DispatchSummary({ result }: { result: DispatchPlannerResult }) {
  return (
    <section className="dispatch-summary" aria-label="Dispatch summary">
      <MetricCard label="Queue" value={`${result.normalizedChits.length} chits`} />
      <MetricCard label="Mission plans" value={`${result.missionPlans.length}`} detail={`${result.transientSuperWorkers.length} super-workers`} />
      <MetricCard label="Reservations" value={`${result.reservations.length}`} />
      <MetricCard label="Deficiencies" value={`${result.deficiencyGates.length}`} />
      <MetricCard label="Power gate" value={result.powerGateSummary.status} detail={result.powerGateSummary.networkState.replaceAll("_", " ")} />
      <MetricCard label="Score" value={formatNumber(result.scoreBreakdown.total)} />
    </section>
  );
}

function MetricCard({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <article className="dispatch-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

function QueuePanel({
  onFocus,
  result,
}: {
  onFocus: (ids: readonly string[]) => void;
  result: DispatchPlannerResult;
}) {
  return (
    <section className="dispatch-panel" aria-label="Universal chit queue">
      <PanelHeading title="Universal Chit Queue" count={result.normalizedChits.length} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Chit</th>
              <th>Kind</th>
              <th>Priority</th>
              <th>Due</th>
              <th>Focus</th>
            </tr>
          </thead>
          <tbody>
            {result.normalizedChits.map((chit) => (
              <tr key={chit.id}>
                <th scope="row">{chit.id}</th>
                <td>{chit.kind}</td>
                <td>{chit.priority}</td>
                <td>{formatTime(chit.dueAt)}</td>
                <td>
                  <button onClick={() => onFocus([
                    chit.origin.serviceZoneId ?? chit.origin.stationId,
                    chit.destination.serviceZoneId ?? chit.destination.stationId,
                  ])} type="button">
                    Focus chit {chit.id}
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

function InventoryPanel({
  onFocus,
  result,
}: {
  onFocus: (ids: readonly string[]) => void;
  result: DispatchPlannerResult;
}) {
  const visibleAssets = result.assets.filter((asset) =>
    asset.kind !== "guideway" && asset.kind !== "power-source"
  );
  return (
    <section className="dispatch-panel" aria-label="Persistent asset inventory">
      <PanelHeading title="Persistent Assets" count={visibleAssets.length} />
      <ul className="dispatch-list">
        {visibleAssets.map((asset) => (
          <li key={asset.id}>
            <div>
              <strong>{asset.label}</strong>
              <span>{asset.kind} · {asset.state}</span>
              <small>{asset.capabilities.join(", ")}</small>
            </div>
            <button onClick={() => onFocus([asset.id, asset.tileId ?? ""])} type="button">
              Focus asset {asset.id}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WorkerPanel({ result }: { result: DispatchPlannerResult }) {
  return (
    <section className="dispatch-panel" aria-label="Dispatch worker pool">
      <PanelHeading title="Workers" count={result.workers.length} />
      <ul className="dispatch-list compact">
        {result.workers.map((worker) => (
          <li key={worker.id}>
            <div>
              <strong>{worker.id}</strong>
              <span>{worker.kind} · {worker.source}</span>
              <small>{worker.capabilities.join(", ")}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConsistPanel({ result }: { result: DispatchPlannerResult }) {
  return (
    <section className="dispatch-panel" aria-label="Transient super-workers">
      <PanelHeading title="Transient Consists" count={result.transientSuperWorkers.length} />
      <ul className="dispatch-list compact">
        {result.transientSuperWorkers.map((worker) => (
          <SuperWorkerItem key={worker.id} worker={worker} />
        ))}
      </ul>
    </section>
  );
}

function SuperWorkerItem({ worker }: { worker: TransientSuperWorker }) {
  return (
    <li>
      <div>
        <strong>{worker.id}</strong>
        <span>{worker.primaryWorkerId}</span>
        <small>{worker.assetIds.join(", ")}</small>
      </div>
    </li>
  );
}

function MissionPanel({
  onFocus,
  result,
}: {
  onFocus: (ids: readonly string[]) => void;
  result: DispatchPlannerResult;
}) {
  return (
    <section className="dispatch-panel" aria-label="Mission plans">
      <PanelHeading title="Mission Plans" count={result.missionPlans.length} />
      <ul className="dispatch-cards">
        {result.missionPlans.map((plan) => (
          <MissionCard key={plan.id} onFocus={onFocus} plan={plan} />
        ))}
      </ul>
    </section>
  );
}

function MissionCard({
  onFocus,
  plan,
}: {
  onFocus: (ids: readonly string[]) => void;
  plan: MissionPlan;
}) {
  const focusIds = plan.route.linkIds.length > 0 ? plan.route.linkIds : [plan.route.destinationNodeId];
  return (
    <li data-testid={`dispatch-mission-${plan.chitId}`}>
      <article>
        <div className="dispatch-card-heading">
          <div>
            <strong>{plan.id}</strong>
            <span>{plan.state} · score {formatNumber(plan.score.total)}</span>
          </div>
          <button onClick={() => onFocus(focusIds)} type="button">
            Focus mission {plan.chitId}
          </button>
        </div>
        <dl>
          <div>
            <dt>Super-worker</dt>
            <dd>{plan.superWorkerId}</dd>
          </div>
          <div>
            <dt>Launch</dt>
            <dd>{plan.launchGate.status} · {plan.launchGate.networkState.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{plan.route.reachable ? `${plan.route.hopCount} links` : "unreachable"}</dd>
          </div>
        </dl>
      </article>
    </li>
  );
}

function ReservationPanel({
  onFocus,
  result,
}: {
  onFocus: (ids: readonly string[]) => void;
  result: DispatchPlannerResult;
}) {
  return (
    <section className="dispatch-panel" aria-label="Dispatch reservations">
      <PanelHeading title="Reservations" count={result.reservations.length} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Type</th>
              <th>Mission</th>
              <th>Window</th>
              <th>Focus</th>
            </tr>
          </thead>
          <tbody>
            {result.reservations.map((reservation) => (
              <ReservationRow key={reservation.id} onFocus={onFocus} reservation={reservation} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReservationRow({
  onFocus,
  reservation,
}: {
  onFocus: (ids: readonly string[]) => void;
  reservation: DispatchReservation;
}) {
  return (
    <tr>
      <th scope="row">{reservation.resourceId}</th>
      <td>{reservation.resourceType}</td>
      <td>{reservation.missionPlanId}</td>
      <td>{formatTime(reservation.startTime)} - {formatTime(reservation.endTime)}</td>
      <td>
        <button onClick={() => onFocus([reservation.resourceId])} type="button">
          Focus reservation {reservation.resourceId}
        </button>
      </td>
    </tr>
  );
}

function DeficiencyPanel({
  onFocus,
  result,
}: {
  onFocus: (ids: readonly string[]) => void;
  result: DispatchPlannerResult;
}) {
  return (
    <section className="dispatch-panel" aria-label="Deficiency gates">
      <PanelHeading title="Deficiency Gates" count={result.deficiencyGates.length} />
      {result.deficiencyGates.length === 0 ? (
        <p className="empty-state">No dispatch deficiency gates for the current fixture plan.</p>
      ) : (
        <ul className="dispatch-list">
          {result.deficiencyGates.map((gate) => (
            <DeficiencyItem gate={gate} key={gate.id} onFocus={onFocus} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeficiencyItem({
  gate,
  onFocus,
}: {
  gate: DeficiencyGate;
  onFocus: (ids: readonly string[]) => void;
}) {
  return (
    <li className={gate.severity} data-testid={`dispatch-deficiency-${gate.id}`}>
      <div>
        <strong>{gate.kind.replaceAll("_", " ")}</strong>
        <span>{gate.message}</span>
        <small>{gate.action}</small>
      </div>
      <button onClick={() => onFocus([...gate.affectedIds, ...gate.assetIds])} type="button">
        Focus deficiency {gate.id}
      </button>
    </li>
  );
}

function RecommendationPanel({
  onFocus,
  recommendations,
}: {
  onFocus: (ids: readonly string[]) => void;
  recommendations: readonly InfrastructureRecommendation[];
}) {
  return (
    <section className="dispatch-panel" aria-label="Infrastructure recommendations">
      <PanelHeading title="Recommendations" count={recommendations.length} />
      {recommendations.length === 0 ? (
        <p className="empty-state">No dispatch infrastructure recommendations for the current fixture plan.</p>
      ) : (
        <ol className="dispatch-cards">
          {recommendations.map((recommendation) => (
            <li key={recommendation.id}>
              <article>
                <div className="dispatch-card-heading">
                  <div>
                    <strong>{recommendation.action}</strong>
                    <span>{recommendation.kind} · priority {recommendation.priority}</span>
                  </div>
                  <button onClick={() => onFocus(recommendation.affectedIds)} type="button">
                    Focus recommendation {recommendation.id}
                  </button>
                </div>
                <p>{recommendation.rationale}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ScorePanel({ result }: { result: DispatchPlannerResult }) {
  const scores = result.scoreBreakdown;
  return (
    <section className="dispatch-panel" aria-label="Dispatch score breakdown">
      <PanelHeading title="Score Breakdown" count={7} />
      <dl className="dispatch-score-list">
        <ScoreRow label="Priority" value={scores.priority} />
        <ScoreRow label="Deadline" value={scores.deadlineUrgency} />
        <ScoreRow label="Route" value={scores.routeEfficiency} />
        <ScoreRow label="Capability" value={scores.capabilityFit} />
        <ScoreRow label="Capacity" value={scores.capacityHeadroom} />
        <ScoreRow label="Power" value={scores.powerReadiness} />
        <ScoreRow label="Total" value={scores.total} />
      </dl>
    </section>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <meter max={100} min={0} value={Math.max(0, Math.min(100, value))} />
        <span>{formatNumber(value)}</span>
      </dd>
    </div>
  );
}

function SeededDemandPanel({ chits }: { chits: readonly DispatchPlannerResult["normalizedChits"][number][] }) {
  return (
    <section className="dispatch-panel" aria-label="Seeded demand preview">
      <PanelHeading title="Seeded Demand Preview" count={chits.length} />
      <ul className="dispatch-list compact">
        {chits.map((chit) => (
          <li key={chit.id}>
            <div>
              <strong>{chit.id}</strong>
              <span>{chit.kind} · priority {chit.priority}</span>
              <small>{formatQuantity(chit.quantity)}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PanelHeading({ count, title }: { count: number; title: string }) {
  return (
    <div className="dispatch-panel-heading">
      <h3>{title}</h3>
      <span>{count}</span>
    </div>
  );
}

function selectionForIds(
  ids: readonly string[],
  model: ScenarioMapRenderModel,
  assets: readonly DispatchAsset[],
): ScenarioSelection | null {
  for (const rawId of ids.filter(Boolean)) {
    const normalizedId = normalizeResourceId(rawId);
    const asset = assets.find((candidate) => candidate.id === normalizedId);
    const candidates: ScenarioSelection[] = [
      { kind: "serviceZone", id: normalizedId },
      { kind: "station", id: normalizedId },
      { kind: "tile", id: normalizedId },
      { kind: "guidewayLink", id: normalizedId },
      { kind: "guidewayNode", id: normalizedId },
      { kind: "electricalNode", id: normalizedId },
      { kind: "electricalBranch", id: normalizedId },
      { kind: "electricalSource", id: normalizedId },
      { kind: "electricalLoad", id: normalizedId },
      ...(asset?.tileId ? [{ kind: "tile" as const, id: asset.tileId }] : []),
      ...(asset?.serviceZoneId ? [{ kind: "serviceZone" as const, id: asset.serviceZoneId }] : []),
    ];
    const selection = candidates.find((candidate) => model.boundsByKey.has(selectionKey(candidate)));
    if (selection) {
      return selection;
    }
  }
  return null;
}

function normalizeResourceId(id: string): string {
  return id
    .replace(/^asset:/, "")
    .replace(/^guideway-link:/, "")
    .replace(/^station-zone:/, "")
    .replace(/^power-window:/, "");
}

function formatQuantity(quantity: DispatchPlannerResult["normalizedChits"][number]["quantity"]): string {
  return [
    quantity.passengers ? `${quantity.passengers} pax` : undefined,
    quantity.massKg ? `${quantity.massKg} kg` : undefined,
    quantity.volumeLiters ? `${quantity.volumeLiters} L` : undefined,
    quantity.energyWh ? `${quantity.energyWh} Wh` : undefined,
  ].filter(Boolean).join(" / ") || "unit";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}
