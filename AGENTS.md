# ATOS Agent Working Agreement

This repository is developed according to the ATOS doctrine:

- Design around the smallest atomic unit of failure.
- Everything is a test.
- Fail fast, fail cheap, fail often.
- Prefer the most elegant solution that survives testing.
- Keep all SQL PostgreSQL-compliant.

## Product goal

Build a browser-based prototyping environment for the Autonomous Transportation Operating System (ATOS). The application must let a user design a tabletop cityscape from reusable hex tiles and set pieces, simulate a 100 W distributed power network, generate and inspect contracts/chits, and visualize dispatch plans and look-ahead reservations.

## Required views

1. **Layout Editor**
   - Place, rotate, connect, and remove hex tiles.
   - Place stations, passenger platforms, cargo depots, maintenance sheds, charging yards, buildings, guideway segments, switches, and portals.
   - Validate connector compatibility and network continuity.

2. **Power View**
   - Configure a nominal 100 W source.
   - Assign electrical resistance, conductor capacity, and load priority to tile edges and devices.
   - Visualize bus voltage, current, voltage drop, utilization, and brownout risk.
   - Support load shedding classes so propulsion and safety can outrank decorative loads.

3. **Capacity View**
   - Visualize guideway-block occupancy, station capacity, platform capacity, cargo handling slots, charging slots, and maintenance slots.
   - Show bottlenecks and deficiency gates.

4. **Dispatch Planner**
   - Show unsatisfied chits ranked by effective priority.
   - Show candidate carriers, selected carriers, temporary consists, routes, expected timing, and reserve energy.
   - Show committed route reservations and a configurable look-ahead horizon.
   - Explain why an unsatisfied chit cannot currently be fulfilled.

5. **Simulation Controls**
   - Pause, run, step, reset, and change simulation speed.
   - Seed deterministic random contract generation.
   - Inject faults, closures, capacity reductions, and power disturbances.

## Architecture constraints

- Use TypeScript.
- Use React with Vite for the initial web client.
- Keep the first release static-first and fully runnable in the browser.
- Store scenarios as versioned JSON documents.
- Implement simulation logic as framework-independent TypeScript packages.
- Use Web Workers for simulation work that would block rendering.
- Keep rendering separate from domain state.
- Avoid embedding business rules directly in UI components.
- Use PostgreSQL only for optional persistence, collaborative scenarios, and historical telemetry.
- Do not require a backend for the first usable prototype.

## Suggested workspace

```text
apps/web/                 React/Vite user interface
packages/domain/          contracts, chits, assets, stations, routes
packages/layout/          hex geometry, connectors, cityscape pieces
packages/power/           DC network and load-shedding simulation
packages/dispatch/        candidate generation, scoring, planning
packages/simulation/      clock, events, faults, telemetry
packages/scenario/        JSON schema, import/export, migrations
schema/                   PostgreSQL DDL and views
docs/                     ADRs and architecture notes
```

## Agent roles

Work may be divided among transient agents, but each task must produce a reviewable artifact.

### Domain agent
Owns contracts, universal chits, assets, workers, transient super workers, manifests, maintenance state, and deficiency gates.

### Layout agent
Owns hex geometry, connector rules, tile library, set-piece definitions, placement validation, and serialization.

### Power agent
Owns the 100 W DC network model, voltage-drop calculation, conductor limits, load priority, regenerative energy, and load shedding.

### Dispatch agent
Owns graph routing, eligible-carrier pools, chit scoring, consist formation, reservations, look-ahead planning, and explanations.

### UI agent
Owns editor interaction, visualization, accessibility, responsive behavior, and cross-view synchronization.

### Verification agent
Owns deterministic fixtures, unit tests, scenario tests, performance tests, and regression snapshots.

## Delivery rule

Every change must include:

- a narrowly stated capability;
- a deterministic test or fixture;
- observable failure behavior;
- documentation when an architectural choice changes;
- no unrelated refactoring.

## Initial vertical slice

The first end-to-end slice must support:

1. Load a small JSON layout containing six connected hex tiles.
2. Render one station, one passenger platform, one cargo depot, one charging siding, and a loop of guideway.
3. Apply a 100 W source and several distributed loads.
4. Calculate and visualize voltage at each tile and load.
5. Generate commuter, express-passenger, local-cargo, and battery-support chits.
6. Assign available cars to a feasible subset of chits.
7. Display pending chits, selected routes, reservations, and deficiency reasons.

Do not begin with photorealistic rendering, authentication, multiplayer editing, or hardware control.