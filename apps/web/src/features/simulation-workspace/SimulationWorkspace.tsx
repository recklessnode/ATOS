import { useMemo, useRef, useState } from "react";
import {
  advanceSimulationBy,
  createDefaultSimulationInput,
  filterSimulationEvents,
  initializeSimulation,
  pauseSimulation,
  resumeSimulation,
  setSimulationPlaybackSpeed,
  stepSimulationToNextEvent,
  type SimulationEvent,
  type SimulationEventSeverity,
  type SimulationEventType,
  type SimulationInput,
  type SimulationRuntimeState,
} from "@atos/simulation";
import {
  ScenarioMap,
  type ScenarioMapFocusRequest,
} from "../scenario-map";
import { buildScenarioMapRenderModel, type ScenarioMapRenderModel } from "../scenario-map/render-model";
import { selectionKey, type ScenarioSelection } from "../scenario-map/selection";
import "./SimulationWorkspace.css";

type SimulationWorkspaceProps = {
  inputOverride?: SimulationInput;
};

type EventFilters = {
  missionId: string;
  eventType: string;
  severity: string;
  resourceId: string;
};

export function SimulationWorkspace({ inputOverride }: SimulationWorkspaceProps) {
  const input = useMemo(() => inputOverride ?? createDefaultSimulationInput(), [inputOverride]);
  const [runtime, setRuntime] = useState<SimulationRuntimeState>(() => initializeSimulation(input));
  const [filters, setFilters] = useState<EventFilters>({
    missionId: "",
    eventType: "",
    severity: "",
    resourceId: "",
  });
  const focusRequestId = useRef(0);
  const [focusRequest, setFocusRequest] = useState<ScenarioMapFocusRequest | undefined>();
  const mapModel = useMemo(() => {
    const base = buildScenarioMapRenderModel(input.scenario);
    return { ...base, layers: { ...base.layers, guideway: true, stations: true, electrical: true } };
  }, [input.scenario]);
  const visibleEvents = useMemo(() => filterSimulationEvents(runtime.eventHistory, {
    missionId: filters.missionId || undefined,
    eventType: filters.eventType ? filters.eventType as SimulationEventType : undefined,
    severity: filters.severity ? filters.severity as SimulationEventSeverity : undefined,
    resourceId: filters.resourceId || undefined,
  }), [runtime.eventHistory, filters]);
  const eventTypes = uniqueSorted(runtime.eventHistory.map((event) => event.type));
  const missionIds = runtime.missions.map((mission) => mission.plan.id).sort();
  const resourceIds = uniqueSorted(runtime.eventHistory.flatMap((event) => event.affectedResourceIds));

  function reset(): void {
    setRuntime(initializeSimulation(input));
    setFilters({ missionId: "", eventType: "", severity: "", resourceId: "" });
  }

  function focusSelection(selection: ScenarioSelection | null): void {
    if (!selection) {
      return;
    }
    focusRequestId.current += 1;
    setFocusRequest({ selection, requestId: focusRequestId.current });
  }

  function focusByIds(ids: readonly string[]): void {
    focusSelection(selectionForIds(ids, mapModel, runtime));
  }

  return (
    <section className="simulation-workspace" id="simulation" aria-label="Simulation workspace">
      <div className="simulation-heading">
        <div>
          <p className="workspace-status">Simulation</p>
          <h2>Simulation Event Log</h2>
        </div>
        <p>
          Deterministic execution of dispatch plans through clock events, guideway occupancy,
          station actions, consists, battery state, faults, and replanning requests.
        </p>
      </div>

      <ClockControls
        onAdvance={() => setRuntime((current) => advanceSimulationBy(current, current.config.tickSeconds))}
        onPlayPause={() => setRuntime((current) =>
          current.clock.status === "running" ? pauseSimulation(current) : resumeSimulation(current)
        )}
        onReset={reset}
        onSpeedChange={(speed) => setRuntime((current) => setSimulationPlaybackSpeed(current, speed))}
        onStep={() => setRuntime((current) => stepSimulationToNextEvent(current))}
        runtime={runtime}
      />

      <SimulationSummary runtime={runtime} />

      <div className="simulation-map-panel">
        <ScenarioMap
          ariaLabel="Simulation scenario map"
          focusRequest={focusRequest}
          headingDescription="Stable-ID focus for active simulated occupancy, mission routes, station resources, and fault targets."
          headingStatus="Simulation map"
          headingTitle="Simulation Scenario Map"
          key={focusRequest?.requestId ?? "simulation-map"}
          model={mapModel}
          sectionId="simulation-map"
        />
      </div>

      <div className="simulation-grid">
        <MissionRuntimePanel runtime={runtime} onFocus={focusByIds} />
        <OccupancyPanel runtime={runtime} onFocus={focusByIds} />
      </div>

      <div className="simulation-grid simulation-grid-wide">
        <EventTimelinePanel
          eventTypes={eventTypes}
          filters={filters}
          missionIds={missionIds}
          onFilterChange={setFilters}
          onFocus={focusByIds}
          resourceIds={resourceIds}
          visibleEvents={visibleEvents}
        />
        <AssetEnergyPanel runtime={runtime} onFocus={focusByIds} />
      </div>

      <div className="simulation-grid simulation-grid-wide">
        <ReservationPanel runtime={runtime} onFocus={focusByIds} />
        <ConsistPanel runtime={runtime} />
      </div>

      <div className="simulation-grid simulation-grid-wide">
        <FaultPanel runtime={runtime} onFocus={focusByIds} />
        <ReplanningPanel runtime={runtime} onFocus={focusByIds} />
      </div>
    </section>
  );
}

function ClockControls({
  onAdvance,
  onPlayPause,
  onReset,
  onSpeedChange,
  onStep,
  runtime,
}: {
  onAdvance: () => void;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onStep: () => void;
  runtime: SimulationRuntimeState;
}) {
  return (
    <section className="simulation-controls" aria-label="Simulation controls">
      <button onClick={onPlayPause} type="button">
        {runtime.clock.status === "running" ? "Pause" : "Play"}
      </button>
      <button onClick={onStep} type="button">Step to next event</button>
      <button onClick={onAdvance} type="button">Advance 60 seconds</button>
      <button onClick={onReset} type="button">Reset</button>
      <label>
        Playback speed
        <select
          aria-label="Playback speed"
          onChange={(event) => onSpeedChange(Number(event.currentTarget.value))}
          value={runtime.clock.playbackSpeed}
        >
          {[0.5, 1, 2, 4].map((speed) => (
            <option key={speed} value={speed}>{speed}x</option>
          ))}
        </select>
      </label>
    </section>
  );
}

function SimulationSummary({ runtime }: { runtime: SimulationRuntimeState }) {
  const activeMissions = runtime.missions.filter((mission) =>
    !["completed", "failed", "cancelled", "blocked"].includes(mission.state)
  ).length;
  return (
    <section className="simulation-summary" aria-label="Simulation summary">
      <MetricCard label="Clock" value={formatTime(runtime.clock.currentTime)} detail={runtime.clock.status} />
      <MetricCard label="Missions" value={`${activeMissions} active`} detail={`${runtime.missions.length} total`} />
      <MetricCard label="Events" value={`${runtime.eventHistory.length}`} detail={`${runtime.eventQueue.length} queued`} />
      <MetricCard label="Occupancy" value={`${runtime.guidewayOccupancy.length}`} detail={`${runtime.serviceOccupancy.length} service`} />
      <MetricCard label="Battery" value={`${formatNumber(totalBattery(runtime))} Wh`} />
      <MetricCard label="Replanning" value={`${runtime.replanningRequests.length}`} />
    </section>
  );
}

function MetricCard({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <article className="simulation-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

function MissionRuntimePanel({
  onFocus,
  runtime,
}: {
  onFocus: (ids: readonly string[]) => void;
  runtime: SimulationRuntimeState;
}) {
  return (
    <section className="simulation-panel" aria-label="Active missions">
      <PanelHeading title="Mission Runtime" count={runtime.missions.length} />
      <ul className="simulation-list">
        {runtime.missions.map((mission) => (
          <li key={mission.plan.id}>
            <div>
              <strong>{mission.plan.id}</strong>
              <span>{mission.state} · {formatNumber(mission.energyConsumedWh)} Wh</span>
              <small>{mission.plan.chitIds.join(", ")}</small>
            </div>
            <button onClick={() => onFocus(mission.plan.route.linkIds.length > 0 ? mission.plan.route.linkIds : [mission.plan.route.destinationNodeId])} type="button">
              Focus mission {mission.plan.chitId}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OccupancyPanel({
  onFocus,
  runtime,
}: {
  onFocus: (ids: readonly string[]) => void;
  runtime: SimulationRuntimeState;
}) {
  return (
    <section className="simulation-panel" aria-label="Guideway and service occupancy">
      <PanelHeading title="Occupancy" count={runtime.guidewayOccupancy.length + runtime.serviceOccupancy.length} />
      {runtime.guidewayOccupancy.length === 0 && runtime.serviceOccupancy.length === 0 ? (
        <p className="empty-state">No active guideway or service occupancy at the current clock time.</p>
      ) : null}
      <ul className="simulation-list compact">
        {runtime.guidewayOccupancy.map((occupancy) => (
          <li key={occupancy.id}>
            <div>
              <strong>{occupancy.linkId}</strong>
              <span>{occupancy.missionId}</span>
              <small>{formatTime(occupancy.enteredAt)} - {formatTime(occupancy.exitAt)}</small>
            </div>
            <button onClick={() => onFocus([occupancy.linkId])} type="button">
              Focus occupancy {occupancy.linkId}
            </button>
          </li>
        ))}
        {runtime.serviceOccupancy.map((occupancy) => (
          <li key={occupancy.id}>
            <div>
              <strong>{occupancy.resourceId}</strong>
              <span>{occupancy.action} · {occupancy.missionId}</span>
              <small>{formatTime(occupancy.startTime)} - {formatTime(occupancy.endTime)}</small>
            </div>
            <button onClick={() => onFocus([occupancy.resourceId])} type="button">
              Focus service {occupancy.resourceId}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EventTimelinePanel({
  eventTypes,
  filters,
  missionIds,
  onFilterChange,
  onFocus,
  resourceIds,
  visibleEvents,
}: {
  eventTypes: readonly string[];
  filters: EventFilters;
  missionIds: readonly string[];
  onFilterChange: (filters: EventFilters) => void;
  onFocus: (ids: readonly string[]) => void;
  resourceIds: readonly string[];
  visibleEvents: readonly SimulationEvent[];
}) {
  return (
    <section className="simulation-panel" aria-label="Event timeline">
      <PanelHeading title="Event Timeline" count={visibleEvents.length} />
      <div className="simulation-filters" aria-label="Event filters">
        <label>
          Mission
          <select
            aria-label="Filter events by mission"
            onChange={(event) => onFilterChange({ ...filters, missionId: event.currentTarget.value })}
            value={filters.missionId}
          >
            <option value="">All missions</option>
            {missionIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>
          Type
          <select
            aria-label="Filter events by type"
            onChange={(event) => onFilterChange({ ...filters, eventType: event.currentTarget.value })}
            value={filters.eventType}
          >
            <option value="">All types</option>
            {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          Severity
          <select
            aria-label="Filter events by severity"
            onChange={(event) => onFilterChange({ ...filters, severity: event.currentTarget.value })}
            value={filters.severity}
          >
            <option value="">All severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
        </label>
        <label>
          Resource
          <select
            aria-label="Filter events by resource"
            onChange={(event) => onFilterChange({ ...filters, resourceId: event.currentTarget.value })}
            value={filters.resourceId}
          >
            <option value="">All resources</option>
            {resourceIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      </div>
      <ol className="simulation-events">
        {visibleEvents.map((event) => (
          <li className={event.severity} key={event.id}>
            <div>
              <strong>{event.type}</strong>
              <span>{formatTime(event.timestamp)} · {event.missionId ?? "global"}</span>
              <small>{[...event.affectedResourceIds, ...event.affectedAssetIds].join(", ") || event.id}</small>
            </div>
            <button onClick={() => onFocus([...event.affectedResourceIds, ...event.affectedAssetIds])} type="button">
              Focus event {event.type}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AssetEnergyPanel({
  onFocus,
  runtime,
}: {
  onFocus: (ids: readonly string[]) => void;
  runtime: SimulationRuntimeState;
}) {
  return (
    <section className="simulation-panel" aria-label="Asset locations and battery state">
      <PanelHeading title="Assets and Energy" count={runtime.assets.length} />
      <ul className="simulation-list compact">
        {runtime.assets.map((asset) => (
          <li key={asset.assetId}>
            <div>
              <strong>{asset.label}</strong>
              <span>{asset.kind} · {asset.health}</span>
              <small>
                {asset.tileId ?? asset.serviceZoneId ?? "unstaged"}
                {asset.battery ? ` · ${formatNumber(asset.battery.stateOfChargeWh)} / ${formatNumber(asset.battery.usableCapacityWh)} Wh` : ""}
              </small>
            </div>
            <button onClick={() => onFocus([asset.assetId, asset.tileId ?? "", asset.serviceZoneId ?? ""])} type="button">
              Focus asset {asset.assetId}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReservationPanel({
  onFocus,
  runtime,
}: {
  onFocus: (ids: readonly string[]) => void;
  runtime: SimulationRuntimeState;
}) {
  return (
    <section className="simulation-panel" aria-label="Reservation status">
      <PanelHeading title="Reservations" count={runtime.reservations.length} />
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
            {runtime.reservations.map((reservation) => (
              <tr key={reservation.reservation.id}>
                <th scope="row">{reservation.reservation.resourceId}</th>
                <td>{reservation.status}</td>
                <td>{reservation.reservation.missionPlanId}</td>
                <td>
                  <button onClick={() => onFocus([reservation.reservation.resourceId])} type="button">
                    Focus reservation {reservation.reservation.resourceId}
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

function ConsistPanel({ runtime }: { runtime: SimulationRuntimeState }) {
  return (
    <section className="simulation-panel" aria-label="Consist composition">
      <PanelHeading title="Consists" count={runtime.consists.length} />
      <ul className="simulation-list compact">
        {runtime.consists.map((consist) => (
          <li key={consist.id}>
            <div>
              <strong>{consist.superWorker.id}</strong>
              <span>{consist.status}</span>
              <small>{consist.memberAssetIds.join(", ")}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FaultPanel({
  onFocus,
  runtime,
}: {
  onFocus: (ids: readonly string[]) => void;
  runtime: SimulationRuntimeState;
}) {
  return (
    <section className="simulation-panel" aria-label="Fault schedule and active faults">
      <PanelHeading title="Faults" count={runtime.faults.length + runtime.faultSchedule.length} />
      {runtime.faultSchedule.length === 0 ? <p className="empty-state">No injected faults in the current fixture.</p> : null}
      <ul className="simulation-list compact">
        {runtime.faultSchedule.map((fault) => (
          <li key={fault.id} className={runtime.faults.some((active) => active.id === fault.id) ? "warning" : undefined}>
            <div>
              <strong>{fault.type}</strong>
              <span>{fault.behavior} · {formatTime(fault.startsAt)}</span>
              <small>{fault.message}</small>
            </div>
            <button onClick={() => onFocus([fault.targetId])} type="button">
              Focus fault {fault.id}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReplanningPanel({
  onFocus,
  runtime,
}: {
  onFocus: (ids: readonly string[]) => void;
  runtime: SimulationRuntimeState;
}) {
  return (
    <section className="simulation-panel" aria-label="Replanning requests">
      <PanelHeading title="Replanning Requests" count={runtime.replanningRequests.length} />
      {runtime.replanningRequests.length === 0 ? (
        <p className="empty-state">No replanning requests have crossed the simulation boundary.</p>
      ) : (
        <ul className="simulation-list">
          {runtime.replanningRequests.map((request) => (
            <li key={request.id} className="warning">
              <div>
                <strong>{request.id}</strong>
                <span>{request.reason}</span>
                <small>{request.chitIds.join(", ")}</small>
              </div>
              <button onClick={() => onFocus(request.affectedAssetIds)} type="button">
                Focus replanning {request.id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PanelHeading({ count, title }: { count: number; title: string }) {
  return (
    <div className="simulation-panel-heading">
      <h3>{title}</h3>
      <span>{count}</span>
    </div>
  );
}

function selectionForIds(
  ids: readonly string[],
  model: ScenarioMapRenderModel,
  runtime: SimulationRuntimeState,
): ScenarioSelection | null {
  for (const rawId of ids.filter(Boolean)) {
    const normalizedId = normalizeResourceId(rawId);
    const asset = runtime.assets.find((candidate) => candidate.assetId === normalizedId);
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
    ];
    if (asset?.tileId) {
      candidates.push({ kind: "tile", id: asset.tileId });
    }
    if (asset?.serviceZoneId) {
      candidates.push({ kind: "serviceZone", id: asset.serviceZoneId });
    }
    const found = candidates.find((candidate) => model.detailByKey.has(selectionKey(candidate)));
    if (found) {
      return found;
    }
  }
  return null;
}

function normalizeResourceId(id: string): string {
  return id
    .replace(/^guideway-link:/, "")
    .replace(/^station-zone:/, "")
    .replace(/^asset:/, "");
}

function totalBattery(runtime: SimulationRuntimeState): number {
  return runtime.assets.reduce((sum, asset) => sum + (asset.battery?.stateOfChargeWh ?? 0), 0);
}

function formatTime(value: string): string {
  return value.slice(11, 19);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
