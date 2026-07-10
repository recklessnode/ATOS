# ATOS Web Prototyping Environment

- Status: Draft
- Date: 2026-07-10

## Purpose

The ATOS web prototype is a digital twin and design laboratory for the tabletop transportation system. It should allow layout, electrical, logistical, and dispatch ideas to fail cheaply in software before physical construction.

## Deployment target

The first usable release is a static browser application built with React, TypeScript, and Vite. It must be deployable from the repository to either GitHub Pages or Vercel.

The simulation kernel and scenario data run entirely in the browser. PostgreSQL is reserved for later persistence, collaboration, fleet history, and telemetry. The static prototype must not depend on PostgreSQL to load, edit, simulate, export, or import a scenario.

## Core packages

### `packages/domain`

Defines stable domain types:

- Contract
- UniversalChit
- Manifest
- Asset
- Vehicle
- Station
- ServiceZone
- Worker
- TransientSuperWorker
- Mission
- DeficiencyGate

### `packages/layout`

Defines the cityscape and guideway:

- Axial hex coordinates
- Tile orientation
- Edge connectors
- Tile elevation
- Guideway nodes and links
- Buildings and service set pieces
- Placement and connectivity validation
- Scenario serialization

### `packages/power`

Models a low-voltage DC distribution system supplied by a nominal 100 W source.

Initial model:

- Each conductor edge has resistance, current limit, and enabled state.
- Each load has requested power, minimum voltage, load class, and shedding priority.
- The solver calculates node voltage, branch current, conductor loss, source utilization, and unmet demand.
- Load shedding protects propulsion, control, braking, and safety before buildings, effects, and decorative lighting.
- Regenerative braking can be represented as a time-varying negative load with storage and source-absorption limits.

The first model may use a resistive DC network and iterative constant-power load approximation. It should expose non-convergence and infeasible states rather than conceal them.

### `packages/dispatch`

Consumes the current network, assets, service capacities, energy state, and unsatisfied chits.

Pipeline:

1. Derive vehicle requirement classes from chit attributes.
2. Generate candidate assets that can reach the origin in time.
3. Check capacity, features, health, energy, and compatibility.
4. Bundle compatible chits where beneficial.
5. Form candidate transient super workers.
6. Calculate feasible routes and service events.
7. Score alternatives globally against the current unsatisfied queue.
8. Commit a bounded look-ahead plan.
9. Emit deficiency gates for remaining chits.

The first planner may be heuristic. It must be deterministic under a supplied random seed and expose its scoring components.

### `packages/simulation`

Owns:

- Simulation clock
- Discrete events
- Contract generation
- Vehicle movement
- Loading and unloading
- Charging and energy consumption
- Maintenance progression
- Fault injection
- Telemetry snapshots

### `apps/web`

Provides four synchronized workspaces:

- Layout
- Power
- Capacity
- Dispatch

Selecting an object in one view highlights the same object in all other views.

## Hex tile library

A tile definition is data, not a UI component. Each tile includes:

```ts
interface HexTileDefinition {
  type: string;
  version: number;
  label: string;
  tags: string[];
  edges: TileEdgeDefinition[];
  setPieces: SetPieceDefinition[];
  electrical: ElectricalTileDefinition;
  constraints: PlacementConstraint[];
}
```

Initial tiles:

- Blank utility tile
- Straight guideway
- 60-degree curve
- 120-degree curve
- Three-way junction
- Station approach
- Passenger station
- Cargo depot
- Maintenance shed
- Charging yard
- Battery staging siding
- City/residential block
- Industrial block
- Power-injection tile
- Portal or off-layout interchange

## Set-piece library

Initial set pieces:

- Passenger platform
- Passenger building
- Cargo warehouse
- Forklift zone
- Gantry crane
- Maintenance shed
- Charging pad
- Battery rack or power-car siding
- Guideway sensor
- Switch field controller
- Utility cabinet
- Street, sidewalk, landscaping, and decorative building loads

A set piece may contribute:

- Visual geometry
- Electrical load or generation
- Service capability
- Dispatch capacity
- Sensor or control capability
- Placement constraints

## Scenario format

Scenarios are versioned JSON documents containing:

- Layout metadata
- Tile instances
- Set-piece instances
- Network graph
- Electrical graph
- Stations and service zones
- Vehicles and asset state
- Contracts and chits
- Simulation settings
- Random seed

Schema migrations must preserve old scenarios where practical.

## Planner look-ahead

The dispatch view should distinguish:

- Unplanned chits
- Candidate assignments
- Held reservations
- Committed missions
- Active movements
- Expected future resource release

The look-ahead horizon is bounded by time and event count so the user can see what the planner believes will happen without implying certainty beyond known state.

## Deficiency explanations

The UI must aggregate deficiencies into useful statements, for example:

- Two additional commuter cars are required near Station A.
- Cargo unloading capacity at Station C is the dominant queue constraint.
- The north branch is power constrained during simultaneous acceleration.
- A charging siding is required within the long-haul service region.
- The route exists, but no compatible vehicle can reach the origin before the due time.

## Agent workflow

Agents should work in vertical slices rather than isolated layers. A slice begins with a scenario fixture and ends with a visible behavior in the browser plus automated tests.

Suggested order:

1. Workspace and deployment
2. Scenario schema and six-tile fixture
3. Hex layout editor
4. Guideway graph extraction
5. DC power simulation
6. Chit queue and vehicle inventory
7. Single-mission dispatch
8. Look-ahead reservations
9. Deficiency aggregation
10. Random contract buckets and fault injection

## Non-goals for the first release

- Real-time hardware control
- Multi-user editing
- Account authentication
- Photorealistic 3D
- Full electromagnetic field simulation
- Exact optimal mixed-integer dispatch
- Safety certification
