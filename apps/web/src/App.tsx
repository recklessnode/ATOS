import "./App.css";
import { WORKSPACES } from "./workspaces";

export function App() {
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

      <section className="workspace-grid" aria-label="Workspace placeholders">
        {WORKSPACES.map((workspace) => (
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
