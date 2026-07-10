# Vehicles, Consists, and Routes

## Vehicle model

A vehicle is a physical entity with transport capability. The model applies to train cars, powered cars, battery cars, maintenance vehicles, forklifts, and future road vehicles.

A vehicle declares:

- compatible movement graph
- entry and exit geometry
- inventories and capacities
- coupling interfaces
- traction, braking, stabilization, or energy capability
- sensors and local controller capability
- maintenance and health state
- effect endpoints

A vehicle type is not defined by a single cargo label. A car may simultaneously carry people, baggage, containers, energy, and maintenance equipment if its capacities and ports permit it.

## Permanent car identity

Each car keeps a stable identity independent of any train:

```yaml
entity_id: car-00917
type_id: vehicle.rail.passenger.small
inventories:
  passengers: {amount: 42, capacity: 60, unit: person}
  baggage: {amount: 18, capacity: 30, unit: bag}
health:
  runtime_hours: 126.4
  maintenance_state: serviceable
```

The car remains addressable when parked, charging, undergoing maintenance, or operating alone.

## Software-defined consist

A consist is a temporary coalition of vehicles created to perform one or more contracts. It has an identity, ordered or graph-like membership, coupling relationships, aggregate capabilities, and a lifecycle.

```yaml
consist_id: consist-42
members:
  - car_id: power-car-2
    coupling_node: lead
  - car_id: passenger-7
    coupled_to: power-car-2.rear
  - car_id: cargo-3
    coupled_to: passenger-7.rear
```

Membership may change during operation. Split, merge, reorder, and handoff are explicit transactions with safety checks.

The architecture does not assume every movement is a permanently linear train. A mission can coordinate cars that travel together for one segment, split at a junction, and recombine later. Physical coupling geometry still constrains which formations are possible.

## Capability aggregation

A consist computes derived capabilities from its members:

- total and resource-specific capacity
- traction and braking margin
- stored energy and charging compatibility
- route geometry constraints
- maximum speed and acceleration
- required platform length
- maintenance limitations
- control and communication redundancy

Dispatch may reject a formation or add support cars when the aggregate cannot satisfy a contract safely.

## Track graph

Every addressed track segment contributes directed connectivity between tile edges. The movement graph contains:

- segment identity
- entry and exit interfaces
- geometry and length
- allowed vehicle classes
- occupancy state
- speed and acceleration limits
- power capacity
- switch or routing state
- fault state

A route is not a monolithic energized block. It is a time-bounded reservation of specific graph resources.

## Movement authority

A movement authority grants a consist permission to occupy an ordered set or corridor of track resources during a defined window.

```yaml
movement_id: movement-781
consist_id: consist-42
path: [track-h12, track-h13, junction-h19, track-h25]
valid_from_tick: 84722000
valid_until_tick: 84725000
entry_conditions:
  expected_direction: edge_4
  maximum_speed_mps: 1.8
```

Each tile enforces its local portion. Entry requires a valid authority, compatible identity, safe downstream state, adequate power, and no conflict.

## Dynamic branching missions

A higher-level mission may contain multiple related movement authorities. Example:

1. passenger and cargo cars travel together from the yard
2. cargo cars separate at a junction
3. passenger cars proceed to the station
4. cargo cars proceed to the factory siding
5. a charged power car joins the passenger cars for the next leg

The mission graph expresses dependencies, while each physical movement remains individually authorized and observable.

## Loading and unloading

Transport is a sequence of explicit transfers through compatible ports. A vehicle must be positioned, reserved, and connected to the appropriate station or facility interface.

Transfer planning considers:

- resource compatibility
- available capacity
- platform and dock geometry
- transfer throughput
- workers or handling equipment
- dwell time
- departure deadline
- balance and formation constraints

A station acts as a router between movement graphs and inventory-transfer graphs.

## Passenger routing

Passengers may begin as aggregated cohorts. A cohort includes origin, destination, role, time window, and optional service preference. Boarding reserves vehicle capacity and destination-compatible service.

A church service, school opening, or factory shift can generate time-windowed passenger demand. Homes become less occupied as residents depart, and their state-driven effects update accordingly.

## Freight routing

Freight contracts may require specific vehicle or container classes. The planner can choose among:

- direct movement
- container transshipment
- warehouse staging
- split delivery
- consolidation with other contracts

Cargo remains conserved and reserved throughout the plan.

## Energy as cargo and capability

Battery cars and power modules can be modeled simultaneously as vehicles, energy inventories, and power sources. Their energy is a resource with state-of-charge, discharge limits, health, and reservation policy.

A consist may add or shed energy cars according to route demand. Stations and charging sidings expose recipes that transfer electrical energy into compatible storage inventories.

## Failure behavior

A vehicle or consist fault may:

- reduce speed or capacity
- forbid certain routes
- trigger a maintenance contract
- require a rescue consist
- isolate a car
- force safe stopping

The mission planner replans around changed capabilities rather than treating the entire train as one indivisible object.
