# Resources, Recipes, and Logistics

## Resource registry

All transferable or consumable quantities are registered by stable type ID.

```yaml
resource_type: material.raw_iron
class: bulk_material
canonical_unit: unit
properties:
  physical: true
  stackable: true
  people: false
  hazardous: false
```

Resource classes provide broad compatibility, while exact types preserve meaning. A generic bulk hopper may accept `bulk_material`; a steel recipe may require `material.raw_iron` specifically.

Recommended top-level classes:

- `person`
- `bulk_material`
- `fluid`
- `discrete_good`
- `container`
- `energy`
- `service_capacity`
- `maintenance_resource`
- `abstract_metric`

Abstract metrics such as education, community, pollution, or happiness should not be transported through ordinary physical ports unless a game rule explicitly models them as tokens. They are usually local or regional fields derived from events and activity.

## Inventory rules

An inventory slot declares:

- accepted resource types or classes
- capacity constraints
- whether mixing is allowed
- load and unload ports
- reservation policy
- preservation or hazard requirements

Inventory quantities have three relevant values:

1. **on hand** — physically or authoritatively present
2. **reserved** — committed to a contract or recipe
3. **available** — on hand minus reservations and safety stock

This prevents two trains from being dispatched for the same six containers.

## Cargo units

The engine supports both fungible quantities and individually identified cargo.

Fungible example:

```yaml
resource: material.raw_iron
amount: 37
unit: unit
```

Identified example:

```yaml
entity_id: container-0042
resource: cargo.shipping_container
manifest:
  contents: goods.machine_parts
  amount: 12
  unit: pallet
```

A shipping container is itself a physical entity with an internal inventory. A vehicle carries the container entity rather than flattening its contents into the vehicle inventory.

## Recipes

```yaml
recipe_id: steel.small_batch
inputs:
  - resource: material.raw_iron
    amount: 10
outputs:
  - resource: material.steel
    amount: 8
  - resource: waste.slag
    amount: 2
requirements:
  occupants:
    resource: person.worker
    minimum: 4
  power:
    watts: 2.0
  duration_game_seconds: 60
```

Recipe execution is a state machine:

`eligible -> reserved -> starting -> running -> completing -> completed`

It may also enter `paused`, `starved`, `faulted`, or `cancelled`.

Inputs are reserved before starting. Policy defines whether they are consumed at start, continuously, or at completion. Outputs require destination capacity or an explicit spill/block policy.

## Throughput rather than teleportation

Transfers take time and occupy ports. Each transfer has:

- source inventory and port
- destination inventory and port
- resource and quantity
- start and completion time
- handling equipment requirement
- power and worker requirements
- reservation owner

A station crane or factory forklift can therefore become a real bottleneck. Presentation effects may visualize the transfer, but the transfer state remains authoritative even if animation is shed.

## Demand generation

Entities publish demand from policy, schedule, inventory thresholds, and contracts.

Examples:

- a house with two occupants creates morning destination demand
- a factory below its raw-iron reorder point requests delivery
- a church service creates a time-windowed passenger destination
- a warehouse above its export threshold requests empty freight capacity

Demand should specify outcome, quantity, time window, priority, and acceptable service quality rather than naming a particular vehicle.

```yaml
demand:
  resource: material.raw_iron
  amount: 30
  destination: factory-12.raw_material
  earliest: 08:00
  latest: 12:00
  priority: normal
```

ATOS converts demand into contracts and normalized chits. Dispatch selects assets and forms transient super workers to satisfy them.

## Logistics graph

The world contains multiple overlapping graphs:

- track movement graph
- road movement graph
- pedestrian transfer graph
- material transfer graph
- electrical power graph
- data and event graph

A port attaches an entity to one or more graphs. A station connects train movement to passenger and material transfer. A factory loading dock connects internal inventory to a platform or road node.

Routing cost may include:

- travel time
- congestion
- energy
- handling operations
- required car type
- missed time-window penalty
- risk and maintenance impact

## Pull, push, and contract modes

The system supports three complementary logistics policies.

### Pull

A consumer requests resources when inventory falls below a threshold. This is readable and robust for houses, shops, factories, and stations.

### Push

A producer requests outbound capacity when output inventory rises above a threshold. This prevents blocked production.

### Contract

A planner coordinates both sides for scheduled, priority, or multi-stage work. This is appropriate for passenger timetables, station transfers, maintenance, and high-value cargo.

Definitions can choose defaults while the central planner arbitrates conflicts.

## Congestion and backpressure

Every inventory and port has finite capacity. When a downstream destination cannot accept a resource, backpressure propagates:

- transfer pauses or is not scheduled
- vehicle waits, reroutes, or selects another destination
- upstream recipe pauses
- demand priority may increase
- presentation reflects congestion

No resource disappears to keep the simulation moving. Explicit policies may allow waste, abandonment, or overflow, but these are recorded state transitions.

## People as resources and agents

People use the same inventory and transfer machinery but may also have destination, schedule, patience, and role attributes. For early prototypes, populations can be aggregated cohorts:

```yaml
resource: person.worker
amount: 8
origin: residential-zone-a
destination: factory-12
```

The architecture permits later promotion to individually identified agents without changing building capacities or transport ports.

## Determinism and accounting

Every resource mutation must balance:

`previous + produced + received - consumed - sent - destroyed = current`

Tests should assert conservation by resource type, with explicit exceptions for source, sink, creation, destruction, and abstract-field rules. This accounting discipline is essential for a durable factory and city simulation.
