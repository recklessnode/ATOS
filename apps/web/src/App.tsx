import { useLayoutEffect } from "react";
import { getSixTileCitySummary } from "@atos/scenario";
import "./App.css";
import { PowerWorkspace } from "./features/power-workspace";
import { ScenarioMap } from "./features/scenario-map";
import { WORKSPACES } from "./workspaces";

const scenarioSummary = getSixTileCitySummary();

export function App() {
  useLayoutEffect(() => {
    if (!window.location.hash) {
      return;
    }
    const targetId = window.location.hash.slice(1);
    const target = document.getElementById(targetId);
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start" });
    }
  }, []);

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Autonomous Transportation Operating System</p>
          <h1>ATOS Web Prototype</h1>
        </div>
        <nav aria-label="ATOS workspaces" className="workspace-nav">
          {WORKSPACES.map((workspace) => (
            <a href={`#${workspace.id}`} key={workspace.id}>
              {workspace.name}
            </a>
          ))}
        </nav>
      </header>

      <section className="scenario-status" aria-label="Scenario status">
        <div>
          <p className="workspace-status">Loaded fixture</p>
          <h2>{scenarioSummary.title}</h2>
        </div>
        <ul>
          <li>Schema version: {scenarioSummary.schemaVersion}</li>
          <li>Tiles: {scenarioSummary.tileCount}</li>
          <li>
            Guideway: {scenarioSummary.guidewayNodeCount} nodes /{" "}
            {scenarioSummary.guidewayLinkCount} links
          </li>
          <li>
            Electrical: {scenarioSummary.electricalNodeCount} nodes /{" "}
            {scenarioSummary.electricalBranchCount} branches /{" "}
            {scenarioSummary.electricalLoadCount} loads
          </li>
          <li>
            Stations: {scenarioSummary.stationCount} / Service zones:{" "}
            {scenarioSummary.serviceZoneCount}
          </li>
          <li>Vehicles: {scenarioSummary.vehicleCount}</li>
          <li>Open chits: {scenarioSummary.openChitCount}</li>
          <li>Validation: {scenarioSummary.validationState}</li>
        </ul>
      </section>

      <ScenarioMap />
      <PowerWorkspace />

      <section className="workspace-grid" aria-label="Workspace placeholders">
        {WORKSPACES.filter((workspace) => workspace.id !== "layout" && workspace.id !== "power").map((workspace) => (
          <article className="workspace-panel" id={workspace.id} key={workspace.id}>
            <div>
              <p className="workspace-status">{workspace.status}</p>
              <h2>{workspace.name}</h2>
            </div>
            <p>{workspace.summary}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
