# Physical World Model

## Purpose

ATOS models a physical city-builder and factory-logistics game whose board is made from snap-together hex tiles. The software must support new tiles, buildings, track pieces, vehicles, cargos, and behaviors without adding special-case logic for every product.

The durable approach is a data-driven entity model with explicit separation between the physical object, its simulated state, and its presentation.

## Core abstractions

### Physical entity

Anything the system can identify and reason about:

- hex tile
- track segment
- house, church, school, factory, warehouse, or station
- train car, locomotive-equivalent power car, road vehicle, or maintenance unit
- removable cargo token or container
- power-injection module
- scenery with interactive capabilities

Every entity has a stable identity, a type definition, a current attachment or location, capabilities, state, and optional persistent history.

### Tile attachment

An attachment records the relationship between a physical entity and one or more tiles. It includes:

- supporting tile IDs
- orientation and footprint
- electrical and data ports used
- identity/authentication result
- requested service profile
- granted service profile

A multi-tile station is one entity with several attachments or one attachment spanning several tiles. Its subcomponents may request different services from each supporting tile.

### Resource

A typed quantity that may be stored, consumed, produced, transformed, reserved, or transported. Examples include people, raw iron, shipping containers, electrical energy, maintenance hours, jobs, and waste.

Resources have units and compatibility rules. A capacity is always expressed against a resource type or resource class.

### Inventory

An inventory is a set of capacity-constrained resource slots owned by an entity. Inventories may be mixed, dedicated, nested, refrigerated, hazardous, passenger-only, or otherwise constrained.

A factory can therefore expose separate inventories for raw material, finished goods, shipping containers, and people. A church may expose only a people inventory. A train car may expose passenger seats and baggage slots.

### Port

A port is an explicit interface through which something enters or leaves an entity. Port classes include:

- material input or output
- passenger boarding or alighting
- electrical power
- data and events
- vehicle coupling
- track connectivity
- audio output
- maintenance access

Ports make transfer rules inspectable and prevent inventories from teleporting resources between unrelated entities.

### Recipe

A recipe is a timed state transition that consumes inputs, requires conditions, occupies capacity, and produces outputs.

A recipe may represent:

- converting raw iron into steel
- loading containers onto a freight car
- moving people from a platform into a passenger car
- charging a battery car
- conducting a church service
- completing scheduled maintenance

Recipes are generic. Their definitions differ, but the simulation machinery is shared.

### Demand and contract

Demand describes a desired future state. ATOS contracts and chits remain the planning layer that turns demand into executable work.

Examples:

- move 20 people from homes to a factory before shift start
- deliver 30 units of raw iron to a factory
- reserve a platform for an arriving consist
- recharge two battery cars before dispatch

Resources and recipes describe what is physically possible. Contracts and chits describe what the operating system intends to accomplish.

### Effect channel

An effect channel is a physical expression controlled by the entity or its supporting tile:

- light
- motion
- audio
- display
- haptic or vibration
- emitted environmental effect

Effects are derived from authoritative state through declarative rules. Turning on a lamp does not create occupants; occupancy causes a lighting rule to select an appropriate scene.

## State layers

Each entity has four distinct state layers.

1. **Definition state** — immutable or versioned type data such as capacities, ports, recipes, and supported effects.
2. **Authoritative simulation state** — inventories, reservations, health, position, active recipe, and mission membership.
3. **Operational hardware state** — granted power, connectivity, temperatures, faults, and local controller mode.
4. **Presentation state** — currently selected light scene, motor action, audio voices, and animation phase.

This separation is essential. During load shedding, presentation can degrade while simulation state remains valid. A factory may stop its decorative conveyor and ambient sound but retain workers and inventory in the simulation.

## Time model

ATOS should support multiple coordinated timescales:

- sub-millisecond to millisecond protection and synchronization
- 5–20 ms track control and spatial-audio events
- 100 ms–1 s physical animation updates
- 1–10 s logistics and recipe progression
- accelerated in-world schedules for population and economic simulation

The deterministic safety loop must never depend on the slower city simulation tick.

## Event model

State changes publish typed events. Examples:

- `entity.attached`
- `inventory.changed`
- `capacity.threshold_crossed`
- `recipe.started`
- `vehicle.entered_tile`
- `power.service_degraded`
- `occupancy.changed`
- `effect.scene_requested`

Consumers subscribe by event type and scope. This avoids direct coupling between, for example, factory logic and train-dispatch code.

## Persistence and replay

Every authoritative change should be representable as a command plus resulting events. Snapshots provide fast loading; an append-only event log supports debugging, replay, and deterministic tests.

Physical reconnection must reconcile three sources of truth:

1. saved simulation state
2. identity and persistent state stored on the physical payload
3. current observed hardware topology

Reconciliation policy must be explicit per entity type. A removable cargo token may be authoritative about its identity, while the central simulation remains authoritative about quantities and reservations.

## Extensibility requirement

Adding a new building or vehicle should normally require:

- a new type definition
- resource and capacity declarations
- ports and recipes
- effect mappings
- optional behavior policy

It should not require modifying the core simulation engine. New engine code is reserved for genuinely new capability classes, not new content.
