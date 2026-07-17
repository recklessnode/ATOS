import { useMemo, useRef, useState } from "react";
import {
  createDefaultOperationsSession,
  performOperationsReplan,
  requestManualReplan,
  type OperationsIncident,
  type OperationsSession,
} from "@atos/operations";
import {
  ScenarioMap,
  type ScenarioMapFocusRequest,
  type ScenarioMapLiveOverlay,
} from "../scenario-map";
import { buildScenarioMapRenderModel, type ScenarioMapRenderModel } from "../scenario-map/render-model";
import { selectionKey, type ScenarioSelection } from "../scenario-map/selection";
import "./OperationsWorkspace.css";

type OperationsWorkspaceProps = {
  sessionOverride?: OperationsSession;
};

export function OperationsWorkspace({ sessionOverride }: OperationsWorkspaceProps) {
  const [session, setSession] = useState<OperationsSession>(() => sessionOverride ?? createDefaultOperationsSession());
  const focusRequestId = useRef(0);
  const [focusRequest, setFocusRequest] = useState<ScenarioMapFocusRequest | undefined>();
  const runtime = session.runtime;
  const mapModel = useMemo(() => {
    const base = buildScenarioMapRenderModel(runtime.scenario);
    return { ...base, layers: { ...base.layers, guideway: true, stations: true, electrical: true, diagnostics: true } };
  }, [runtime.scenario]);
  const liveOverlay = useMemo<ScenarioMapLiveOverlay>(() => ({
    occupancies: [
      ...runtime.guidewayOccupancy.map((occupancy) => ({
        id: occupancy.id,
        kind: "guideway" as const,
        resourceId: `guideway-link:${occupancy.linkId}`,
        missionId: occupancy.missionId,
        label: `${occupancy.linkId} occupied by ${occupancy.missionId}`,
      })),
      ...runtime.serviceOccupancy.map((occupancy) => ({
        id: occupancy.id,
        kind: "service" as const,
        resourceId: occupancy.resourceId,
        missionId: occupancy.missionId,
        action: occupancy.action,
        label: `${occupancy.resourceId} ${occupancy.action} by ${occupancy.missionId}`,
      })),
    ],
  }), [runtime.guidewayOccupancy, runtime.serviceOccupancy]);

  function focusSelection(selection: ScenarioSelection | null): void {
    if (!selection) {
      return;
    }
    focusRequestId.current += 1;
    setFocusRequest({ selection, requestId: focusRequestId.current });
  }

  function focusByIds(ids: readonly string[]): void {
    focusSelection(selectionForIds(ids, mapModel, session));
  }

  function runManualReplan(): void {
    setSession((current) =>
      performOperationsReplan(
        requestManualReplan(current, { note: "Operator requested a deterministic manual replan from the Operations workspace." }),
      )
    );
  }

  function runPendingReplan(): void {
    setSession((current) => performOperationsReplan(current));
  }

  return (
    <section className="operations-workspace" id="operations" aria-label="Operations workspace">
      <div className="operations-heading">
        <div>
          <p className="workspace-status">Operations</p>
          <h2>Closed-Loop Operations</h2>
        </div>
        <p>
          Deterministic orchestration between dispatch planning and simulation execution:
          replan policy, runtime projection, reservation reconciliation, plan diffs,
          incidents, deficiencies, and operating metrics.
        </p>
      </div>

      <section className="operations-controls" aria-label="Operations controls">
        <button onClick={runPendingReplan} type="button" disabled={session.pendingRequests.length === 0}>
          Apply pending replan
        </button>
        <button onClick={runManualReplan} type="button">
          Manual deterministic replan
        </button>
      </section>

      <OperationsSummary session={session} />

      <div className="operations-map-panel">
        <ScenarioMap
          ariaLabel="Operations scenario map"
          focusRequest={focusRequest}
          headingDescription="Stable-ID focus for replanning requests, reservations, incidents, assets, resources, and deficiencies."
          headingStatus="Operations map"
          headingTitle="Operations Scenario Map"
          key={focusRequest?.requestId ?? "operations-map"}
          liveOverlay={liveOverlay}
          model={mapModel}
          sectionId="operations-map"
        />
      </div>

      <div className="operations-grid">
        <GenerationPanel session={session} />
        <RequestPanel session={session} onFocus={focusByIds} />
      </div>

      <div className="operations-grid operations-grid-wide">
        <PlanDiffPanel session={session} onFocus={focusByIds} />
        <ReservationReconciliationPanel session={session} onFocus={focusByIds} />
      </div>

      <div className="operations-grid operations-grid-wide">
        <IncidentPanel session={session} onFocus={focusByIds} />
        <DeficiencyPanel session={session} onFocus={focusByIds} />
      </div>

      <MetricsPanel session={session} />
    </section>
  );
}

function OperationsSummary({ session }: { session: OperationsSession }) {
  const generation = currentGeneration(session);
  const activeMissions = session.runtime.missions.filter((mission) =>
    !["completed", "failed", "cancelled", "blocked"].includes(mission.state)
  ).length;
  return (
    <section className="operations-summary" aria-label="Operations summary">
      <MetricCard label="Generation" value={`${generation.generationNumber}`} detail={generation.id} />
      <MetricCard label="Runtime" value={session.runtime.clock.status} detail={formatTime(session.runtime.clock.currentTime)} />
      <MetricCard label="Requests" value={`${session.pendingRequests.length} pending`} detail={`${session.policyDecisions.length} decisions`} />
      <MetricCard label="Active execution" value={`${activeMissions} missions`} detail={`${session.runtime.eventHistory.length} events`} />
      <MetricCard label="Incidents" value={`${session.incidents.length}`} />
      <MetricCard label="Completion" value={formatPercent(session.metrics.missionCompletionRate)} />
    </section>
  );
}

function MetricCard({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <article className="operations-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

function GenerationPanel({ session }: { session: OperationsSession }) {
  return (
    <section className="operations-panel" aria-label="Planning generations">
      <PanelHeading title="Planning Generations" count={session.generations.length} />
      <ul className="operations-list compact">
        {session.generations.map((generation) => (
          <li key={generation.id}>
            <div>
              <strong>{generation.id}</strong>
              <span>{generation.dispatchResult.missionPlans.length} missions · {generation.dispatchResult.reservations.length} reservations</span>
              <small>{generation.policyDecision?.mode ?? "initial"} · {formatTime(generation.createdAt)}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestPanel({
  onFocus,
  session,
}: {
  onFocus: (ids: readonly string[]) => void;
  session: OperationsSession;
}) {
  const requests = session.pendingRequests.length > 0 ? session.pendingRequests : session.policyDecisions.map((decision) => ({
    id: decision.requestId,
    source: "operator" as const,
    trigger: decision.trigger,
    status: "requested" as const,
    currentTime: session.runtime.clock.currentTime,
    triggeredByEventId: decision.requestId,
    chitIds: decision.scopeChitIds,
    affectedAssetIds: decision.scopeAssetIds,
    releasedReservationIds: [],
    retainedReservationIds: [],
    assetStates: [],
    reason: decision.rationale,
  }));
  return (
    <section className="operations-panel" aria-label="Pending requests and policy decisions">
      <PanelHeading title="Requests and Policy" count={requests.length} />
      <ul className="operations-list">
        {requests.map((request) => {
          const decision = session.policyDecisions.find((candidate) => candidate.requestId === request.id);
          return (
            <li key={request.id}>
              <div>
                <strong>{request.id}</strong>
                <span>{request.trigger} · {decision?.mode ?? "unclassified"}</span>
                <small>{decision?.rationale ?? request.reason}</small>
              </div>
              <button onClick={() => onFocus([...request.affectedAssetIds, ...request.retainedReservationIds, ...request.releasedReservationIds])} type="button">
                Focus request {request.id}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlanDiffPanel({
  onFocus,
  session,
}: {
  onFocus: (ids: readonly string[]) => void;
  session: OperationsSession;
}) {
  return (
    <section className="operations-panel" aria-label="Plan diff">
      <PanelHeading title="Plan Diff" count={session.planDiff.records.length} />
      {session.planDiff.records.length === 0 ? (
        <p className="empty-state">No revised planning generation has been produced yet.</p>
      ) : (
        <ul className="operations-list">
          {session.planDiff.records.map((record) => (
            <li key={record.id} className={record.status}>
              <div>
                <strong>{record.status}</strong>
                <span>{record.previousMissionId ?? "new"} → {record.revisedMissionId ?? "cancelled"}</span>
                <small>{record.rationale}</small>
              </div>
              <button onClick={() => onFocus(record.chitIds)} type="button">
                Focus diff {record.id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReservationReconciliationPanel({
  onFocus,
  session,
}: {
  onFocus: (ids: readonly string[]) => void;
  session: OperationsSession;
}) {
  return (
    <section className="operations-panel" aria-label="Reservation reconciliation">
      <PanelHeading title="Reservation Reconciliation" count={session.reservationReconciliation.records.length} />
      {session.reservationReconciliation.records.length === 0 ? (
        <p className="empty-state">No reservation reconciliation has been run yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Resource</th>
                <th>Status</th>
                <th>Mission</th>
                <th>Focus</th>
              </tr>
            </thead>
            <tbody>
              {session.reservationReconciliation.records.map((record) => (
                <tr key={record.id}>
                  <th scope="row">{record.resourceId}</th>
                  <td>{record.status}</td>
                  <td>{record.missionPlanId}</td>
                  <td>
                    <button onClick={() => onFocus([record.resourceId])} type="button">
                      Focus reservation {record.reservationId}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function IncidentPanel({
  onFocus,
  session,
}: {
  onFocus: (ids: readonly string[]) => void;
  session: OperationsSession;
}) {
  return (
    <section className="operations-panel" aria-label="Incident correlation">
      <PanelHeading title="Incidents" count={session.incidents.length} />
      <ul className="operations-list">
        {session.incidents.map((incident) => (
          <IncidentItem incident={incident} key={incident.id} onFocus={onFocus} />
        ))}
      </ul>
    </section>
  );
}

function IncidentItem({
  incident,
  onFocus,
}: {
  incident: OperationsIncident;
  onFocus: (ids: readonly string[]) => void;
}) {
  return (
    <li className={incident.resolutionState}>
      <div>
        <strong>{incident.resolutionState}</strong>
        <span>{incident.id}</span>
        <small>{incident.summary}</small>
      </div>
      <button onClick={() => onFocus([
        ...incident.affectedAssetIds,
        ...incident.affectedResourceIds,
        ...incident.affectedChitIds,
      ])} type="button">
        Focus incident {incident.id}
      </button>
    </li>
  );
}

function DeficiencyPanel({
  onFocus,
  session,
}: {
  onFocus: (ids: readonly string[]) => void;
  session: OperationsSession;
}) {
  return (
    <section className="operations-panel" aria-label="Deficiency carry-forward">
      <PanelHeading title="Deficiency Carry-Forward" count={session.deficiencyCarryForward.records.length} />
      {session.deficiencyCarryForward.records.length === 0 ? (
        <p className="empty-state">No deficiency carry-forward comparison has been run yet.</p>
      ) : (
        <ul className="operations-list">
          {session.deficiencyCarryForward.records.map((record) => (
            <li key={record.id} className={record.status}>
              <div>
                <strong>{record.status}</strong>
                <span>{record.kind.replaceAll("_", " ")}</span>
                <small>{record.rationale}</small>
              </div>
              <button onClick={() => onFocus(record.chitIds)} type="button">
                Focus deficiency {record.revisedDeficiencyId ?? record.previousDeficiencyId}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MetricsPanel({ session }: { session: OperationsSession }) {
  const metrics = session.metrics;
  return (
    <section className="operations-panel operations-metrics-panel" aria-label="Operations metrics">
      <PanelHeading title="Operations Metrics" count={10} />
      <dl className="operations-metrics-list">
        <MetricRow label="Replans / simulated hour" value={formatNumber(metrics.replansPerSimulatedHour)} />
        <MetricRow label="Mission completion" value={formatPercent(metrics.missionCompletionRate)} />
        <MetricRow label="On-time completion" value={formatPercent(metrics.onTimeCompletionRate)} />
        <MetricRow label="Average queue wait" value={`${formatNumber(metrics.averageQueueWaitMinutes)} min`} />
        <MetricRow label="Passenger wait" value={`${formatNumber(metrics.averagePassengerWaitMinutes)} min`} />
        <MetricRow label="Cargo lateness" value={`${formatNumber(metrics.averageCargoLatenessMinutes)} min`} />
        <MetricRow label="Asset utilization" value={formatPercent(metrics.assetUtilization)} />
        <MetricRow label="Reservation conflicts" value={formatPercent(metrics.reservationConflictRate)} />
        <MetricRow label="Energy delays" value={`${metrics.energyDelayCount}`} />
        <MetricRow label="Planning churn" value={formatNumber(metrics.planningChurn)} />
      </dl>
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PanelHeading({ count, title }: { count: number; title: string }) {
  return (
    <div className="operations-panel-heading">
      <h3>{title}</h3>
      <span>{count}</span>
    </div>
  );
}

function currentGeneration(session: OperationsSession) {
  return session.generations.find((generation) => generation.id === session.currentGenerationId) ?? session.generations[0];
}

function selectionForIds(
  ids: readonly string[],
  model: ScenarioMapRenderModel,
  session: OperationsSession,
): ScenarioSelection | null {
  for (const rawId of ids.filter(Boolean)) {
    const normalizedId = normalizeResourceId(rawId);
    const runtimeAsset = session.runtime.assets.find((asset) => asset.assetId === normalizedId);
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
      ...(runtimeAsset?.tileId ? [{ kind: "tile" as const, id: runtimeAsset.tileId }] : []),
      ...(runtimeAsset?.serviceZoneId ? [{ kind: "serviceZone" as const, id: runtimeAsset.serviceZoneId }] : []),
      ...(runtimeAsset?.nodeId ? [{ kind: "guidewayNode" as const, id: runtimeAsset.nodeId }] : []),
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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" }).format(value);
}
