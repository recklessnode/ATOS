# Worked Examples

These examples illustrate how different physical objects use the same contracts.

## House

```yaml
entity_id: house-12
type_id: building.residential.house.small
inventories:
  occupants:
    accepts: [person]
    amount: 2
    capacity: 4
effects:
  light_zones: [kitchen, living_room, bedroom_a, bedroom_b, porch]
  audio_emitters: [television, household_ambience]
```

Presentation policy:

- 0 occupants: all interior lights off; optional porch light by schedule
- 1 occupant: one active-room scene
- 2 occupants: one or two room lights and low household ambience
- 3–4 occupants: broader evening activity
- dormant power mode: status/porch light only or fully dark

Morning commute demand moves occupants out of the house inventory into pedestrian, station, and passenger-car inventories. Effects follow the resulting occupancy.

## Apartment complex

```yaml
inventories:
  residents:
    accepts: [person.resident]
    capacity: 100
ports:
  - pedestrian_entrance
  - transit_stop
```

The apartment may aggregate residents into cohorts by destination and departure window. Lighting density can follow occupancy ratio without representing every apartment individually.

## Church

```yaml
inventories:
  attendees:
    accepts: [person]
    capacity: 50
recipes:
  - community.service
```

A scheduled service creates time-windowed passenger demand. At high attendance the church may enable interior light, doors, bells, and crowd ambience. A structure-local speaker renders the bell while supporting tiles may render exterior crowd sound.

## Small steel factory

```yaml
inventories:
  raw_iron: {capacity: 50, resource: material.raw_iron}
  containers: {capacity: 6, resource: cargo.shipping_container}
  workers: {capacity: 10, resource: person.worker}
recipes:
  - steel.small_batch
ports:
  - worker_entrance
  - bulk_material_input
  - container_loading_dock
```

Operational states:

- no workers: dark or security-light scene; production ineligible
- partial shift: office and one production zone lit
- full shift with inputs: furnace, conveyor, crane, and machinery audio enabled
- output blocked: loading-area warning scene; production pauses through backpressure
- reduced power: secondary motion and ambience disabled
- dormant power: presentation off; inventory and reservations retained; recipe paused

## Shipping container

```yaml
entity_id: container-42
type_id: cargo.container.standard
inventories:
  internal:
    accepts: [discrete_good]
    capacity:
      pallets: 12
```

The container is an identified nested inventory. The factory, platform, and freight car transfer the container entity rather than rewriting its contents.

## Passenger car

```yaml
inventories:
  passengers: {capacity: 60, resource: person}
  baggage: {capacity: 30, resource: baggage}
capabilities:
  - transport
  - couplable
  - audio_emitter
```

Occupancy can drive interior light and passenger ambience. Destination reservations ensure passengers board compatible service.

## Freight car

```yaml
inventories:
  containers:
    accepts: [cargo.shipping_container]
    capacity: 6
ports:
  - left_loading
  - right_loading
```

The car may join a mixed consist for one route leg, split at a junction, unload at the factory, and later join a different consist.

## Three-tile station

One station entity spans three tiles.

### Tile A — charging

- high-current service
- train or battery-car identification
- state-of-charge exchange
- temperature monitoring

### Tile B — structural platform

- identity and topology only
- low standby power
- power/data forwarding

### Tile C — active platform

- edge and canopy lights
- crossing arms
- warning lights and bell
- station announcement speaker
- passenger-transfer port

The station definition requests each role by footprint position. The tile runtime validates orientation and grants services.

## Track loop

Track pieces placed around the outer edge of a hex field advertise segment geometry. Software recognizes compatible connected edges and groups them as `Main Loop`, while preserving every segment's address.

A movement authority reserves specific segments for a consist. Supporting tiles schedule localized train audio before arrival, then correct timing with local position observations.

## Brownout sequence

A departing train requests a critical power reservation.

1. decorative ambience stops
2. factory secondary motors pause
3. building lights reduce to essential scenes
4. train propulsion and track control remain granted
5. recipes requiring unavailable power enter `paused_power`
6. after the train stops, lights restore first
7. audio and motors restart in staggered groups
8. paused recipes resume only after their requirements are stable

No cargo, people, or production progress is lost or invented during the sequence.

## Power injection

Telemetry shows excessive voltage drop on the far side of the loop. Software recommends a supplemental source near the station. When attached, the source authenticates, advertises capacity, and receives a bounded supply zone. The scheduler recalculates edge currents and may restore previously constrained presentation loads.
