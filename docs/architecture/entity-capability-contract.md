# Entity Capability Contract

## Goal

Use one contract for tiles, set pieces, track, cargo, and vehicles. An entity declares capabilities; the runtime composes them. Content definitions may be YAML, JSON, or another schema-backed format, but the concepts below are normative.

## Required identity

```yaml
api_version: atos/v1
kind: PhysicalEntityType
metadata:
  type_id: building.factory.steel.small
  definition_version: 1.0.0
  display_name: Small Steel Factory
spec:
  entity_class: set_piece
  footprint:
    tile_count: 2
    allowed_rotations_deg: [0, 60, 120, 180, 240, 300]
```

A physical instance adds a globally unique `entity_id`, hardware revision, firmware version when applicable, and authentication claims.

## Capability vocabulary

Capabilities are composable modules rather than inheritance classes.

- `inventory` — stores typed resources.
- `transformer` — executes recipes.
- `transport` — moves inventories through the world.
- `occupiable` — accepts people or agents.
- `couplable` — can join temporary vehicle consists.
- `track_segment` — contributes edges to the movement graph.
- `power_consumer` — requests electrical service.
- `power_source` — injects power into the tile fabric.
- `power_storage` — charges and discharges energy.
- `sensor` — reports physical observations.
- `light_output` — exposes addressable lighting zones.
- `motion_output` — exposes motors, servos, pumps, or actuators.
- `audio_output` — exposes a speaker or exciter.
- `audio_emitter` — owns a logical sound source that may render on nearby tiles.
- `maintainable` — accumulates wear and accepts maintenance work.
- `behavior` — selects policies and reactions from state and events.

An entity may implement any combination. A tile, factory, and passenger car use the same vocabulary even though their values differ.

## Inventories and capacities

```yaml
inventories:
  - id: raw_material
    slots:
      - accepts: [material.raw_iron]
        capacity: {amount: 50, unit: unit}
  - id: container_yard
    slots:
      - accepts: [cargo.shipping_container]
        capacity: {amount: 6, unit: container}
  - id: occupants
    slots:
      - accepts: [person.worker]
        capacity: {amount: 10, unit: person}
```

Capacity is not a single scalar. An entity can simultaneously have mass, volume, count, seat, and compatibility constraints. Admission succeeds only when every applicable constraint remains valid.

## Ports

```yaml
ports:
  - id: rail_loading_dock
    class: material_transfer
    direction: bidirectional
    accepts: [cargo.shipping_container]
    throughput: {amount: 1, unit: container_per_10s}
  - id: worker_entrance
    class: passenger_transfer
    direction: input
    accepts: [person.worker]
  - id: tile_power
    class: electrical
    direction: input
```

Ports may bind to a tile edge, top-side payload interface, coupler, platform position, or logical service.

## Power request

```yaml
power:
  minimum:
    watts: 0.15
    services: [identity, control]
  normal:
    watts: 1.8
  peak:
    watts: 4.0
    duration_ms: 1200
  priority_class: scenery_animated
  degradation_modes:
    - name: reduced
      disable: [motion.secondary, audio.ambient]
      limit:
        light.max_brightness: 0.5
    - name: dormant
      disable: [motion, audio, light.decorative]
      retain: [identity, control, light.status]
```

Track and protection capabilities use higher-priority service classes and locally enforced fail-safe policies.

## Effect endpoints

```yaml
effects:
  light:
    zones: [office, furnace, loading_dock, status]
  motion:
    actuators: [conveyor, crane, door]
  audio:
    emitters: [machinery, alarm, loading_activity]
    local_speaker: true
    tile_rendering_allowed: true
```

Effects expose semantic names. Hardware-specific channel numbers belong in the instance mapping, not the simulation definition.

## State-to-effect rules

```yaml
presentation_rules:
  - when: occupancy.ratio == 0
    scene: factory.dark
  - when: occupancy.ratio > 0 and occupancy.ratio < 0.5
    scene: factory.partial_shift
  - when: occupancy.ratio >= 0.5 and recipe.active
    scene: factory.production
  - when: power.mode == dormant
    scene: factory.dormant
```

Rules select scenes; scenes specify coordinated light, motion, and audio behavior. Safety policies can override all presentation rules.

## Behavior policies

Behavior policies are named, versioned strategies with bounded authority. Examples:

- `residential.daily_occupancy.v1`
- `factory.pull_inputs_when_below_reorder_point.v1`
- `station.board_by_destination.v1`
- `vehicle.accept_contract_if_energy_margin.v1`

Policies issue requests and contracts. They do not directly mutate inventories, routes, or power grants.

## Runtime negotiation

When attached, an entity sends or exposes:

1. identity and type
2. footprint and orientation
3. required and optional capabilities
4. minimum, normal, and peak power
5. latency and safety class
6. available local effects and storage

The tile runtime responds with granted services, limits, addresses, clock state, and fault policy. The entity must operate within the grant or enter its declared safe mode.
