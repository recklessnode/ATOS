# Modular Sled Platform

## Status

Concept architecture. Dimensions are provisional interface-control values for simulation, packaging, and prototype discussion; they are not release-to-manufacture dimensions.

## Decision

ATOS will separate a rail vehicle into two independently identified entities:

1. **Sled** — the reusable movement, guidance, coupling, power, control, sensing, and safety platform.
2. **Mission module** — the removable payload body that provides passenger, cargo, energy, maintenance, or specialty capability.

The sled remains a permanent fleet asset. A mission module can be loaded, unloaded, stored, transferred, and assigned to another compatible sled.

This avoids building a unique complete railcar for every role and extends the software-defined-consist model down to the car level.

## Baseline Sled S1

Provisional reference envelope:

| Property | Concept value |
|---|---:|
| Overall length over coupler faces | 320 mm |
| Structural deck length | 280 mm |
| Overall width | 72 mm |
| Deck height above guideway datum | 30 mm |
| Usable module footprint | 240 × 64 mm |
| Module attachment stations | 4 |
| Nominal module mass | 0–1.5 kg, prototype target |
| Couplers | identical active front/rear |
| Module power | 24 V raw + regulated auxiliary rails |
| Module data | redundant differential serial link |

Final dimensions depend on guideway geometry, curve radius, magnetic suspension/propulsion hardware, center-of-mass constraints, and chosen physical scale.

## Sled responsibilities

Every S1 sled provides:

- permanent identity and maintenance history
- guideway interaction and position sensing
- propulsion, levitation, stabilization, or passive running interface as selected by the eventual track technology
- braking and safe-stop behavior
- front and rear active couplers
- consist communication and time synchronization
- module detection and authentication
- load and center-of-mass estimation
- protected module power and data
- local energy buffering for control and safe uncoupling
- status lighting and optional local sound emitter

A sled may be powered, passive, or energy-supporting. These are capability differences within the same mechanical interface, not different module standards.

## Module interface

The module mounts to a flat deck using four keyed attachment stations. Each station combines:

- locating cone or tapered pin
- vertical retention latch
- shear face
- optional magnetic preload
- presence sensing

One central service connector supplies:

- 24 V protected raw power
- 5 V auxiliary power
- 3.3 V logic reference where needed
- differential data A/B
- synchronized clock or timestamp service
- module-presence and safe-to-remove lines
- protective earth/chassis reference if required

The mechanical interface carries loads; the electrical connector must not be used as a structural locator.

## Module identity and negotiation

When installed, a module advertises:

- module identity and type
- mass and center-of-mass estimate
- envelope class
- passenger or cargo inventories
- electrical minimum, normal, and peak demand
- effect endpoints: light, motion, audio, display
- required environmental or safety services
- compatible orientations
- loading and unloading ports

The sled validates mass, geometry, power, and route compatibility before the pair enters service.

## Reference module classes

### Commuter passenger pod

- high-capacity seating/standing inventory
- frequent wide-door boarding ports
- interior lighting and occupancy-driven audio
- low dwell-time priority
- nominal capacity example: 24 people

### Overnight passenger pod

- lower capacity with berths and baggage
- longer dwell and service requirements
- quiet lighting scenes and local speaker
- nominal capacity example: 8 people plus baggage

### Battery pod

- identified energy inventory
- battery-management system and contactors
- thermal sensors and optional cooling
- can power its host sled, assist a consist, or serve as transportable grid storage

### 40-foot intermodal module

For the physical model, this is a scale representation of one 40-foot-equivalent container. It occupies the full S1 module footprint and exposes one identified nested cargo inventory.

### Twin 20-foot intermodal adapter

Supports two independently identified 20-foot-equivalent containers. Either position may be empty, and each container retains its own manifest and destination.

### Open-bin module

- bulk material inventory
- optional removable liner
- top-loading and tip/dump or crane-unloading ports
- may specialize through inserts for ore, scrap, aggregate, grain, or waste

## Software composition

A complete operational car is a temporary composition:

```yaml
vehicle_instance:
  sled_id: sled-s1-0042
  module_id: module-commuter-0018
  composed_type: vehicle.rail.commuter
  inventories:
    passengers: 17/24
```

Swapping the module changes the car's mission capabilities without changing the sled's identity, maintenance record, or control address.

## Loading rules

Before accepting a module, the system checks:

1. attachment geometry and orientation
2. module authenticity and interface version
3. total mass and axle/levitation-node loading
4. longitudinal and lateral center of mass
5. electrical peak demand
6. braking and acceleration margin
7. route clearance and platform compatibility
8. hazardous or passenger safety restrictions

A module is mechanically latched before high-power contacts energize. Removal requires the inverse safe sequence.

## Consist behavior

Consist formation operates on composed sled-module vehicles. Dispatch reasons separately about:

- sled mobility and health
- module payload and destination
- coupler topology
- aggregate energy and braking capacity
- passenger/cargo transfer needs

A module may remain at a station while its sled is reassigned, or a replacement sled may collect a module whose original sled requires maintenance.

## Design benefits

- fewer unique propulsion chassis
- faster role changes and repairs
- independent maintenance of mobility and payload systems
- transportable batteries become both cargo and infrastructure
- passenger and freight bodies share one fleet platform
- software can optimize module placement independently of sled placement

## Primary risks

- interface mass and latch complexity
- center-of-mass variation
- passenger safety during module handling
- connector wear and contamination
- excessive module envelope compromising curves or station clearances
- creating one sled size that is mediocre for every use

The architecture permits additional sled sizes later, provided they implement explicit interface classes such as S1, S2, and heavy-haul H1 rather than uncontrolled one-off variants.

## Prototype validation

1. Exchange three passive mass simulators without tools.
2. Detect module identity and orientation reliably.
3. Reject an overweight or incompatible module in software.
4. Carry a commuter pod, battery pod, and twin-container adapter through the minimum-radius test route.
5. Demonstrate safe power sequencing during module installation/removal.
6. Split and recombine composed vehicles while preserving sled and module identities.
7. Measure connector, latch, and deck deflection under worst-case prototype load.

## Schematics

- [S1 sled interface schematic](../schematics/s1-sled-interface.svg)
- [Reference mission modules schematic](../schematics/s1-reference-modules.svg)
