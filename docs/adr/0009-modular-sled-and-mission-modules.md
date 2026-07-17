# ADR 0009: Modular Sled and Mission Modules

## Status

Accepted for prototyping

## Context

ATOS vehicles are dynamic assets that may join, split, recharge, exchange payloads, and form temporary consists. Building complete specialized cars for every passenger, freight, and energy role would duplicate propulsion, guidance, sensing, coupling, control, and maintenance systems.

The physical platform should reflect the software-defined vehicle model.

## Decision

ATOS will define a reusable rail sled and a standardized removable mission-module interface.

The sled owns mobility, guidance, braking, coupling, safety, identity, health, power distribution, and module authentication. Mission modules provide passenger, cargo, energy, maintenance, or specialty capability.

Sled and module remain independently identified physical entities. Their combination forms a temporary operational vehicle instance.

The first prototype interface is designated **S1**. Its dimensions and load limits are provisional until guideway geometry and magnetic hardware are finalized.

Initial reference modules are:

- commuter passenger pod
- overnight passenger pod
- battery/energy pod
- one 40-foot-equivalent intermodal container adapter
- twin 20-foot-equivalent intermodal container adapter
- open-bin/bulk module

## Consequences

### Positive

- one mobility platform supports many missions
- propulsion and payload systems can be maintained independently
- modules can wait at stations while sleds are reassigned
- battery modules can serve both vehicles and the tile power network
- fleet optimization can reason independently about sleds and payloads
- new vehicle roles can often be created as modules rather than complete cars

### Negative

- latches and connectors add mass, cost, and wear
- varying center of mass complicates dynamic control
- passenger modules require stricter interlocks and handling rules
- one sled size may not suit every eventual mission

## Validation criteria

1. The sled detects module identity and orientation.
2. The interface rejects incompatible mass, envelope, power, or route requirements.
3. A module cannot receive high power before mechanical retention is confirmed.
4. The prototype carries passenger, energy, container, and bulk mass simulators through the minimum-radius route.
5. Sled and module histories remain distinct through swaps.
6. Dynamic consist formation uses the capabilities of the composed sled-module vehicle.

## Related documents

- [Modular Sled Platform](../architecture/modular-sled-platform.md)
- [Vehicles, Consists, and Routes](../architecture/vehicles-consists-routes.md)
- [S1 sled schematic](../schematics/s1-sled-interface.svg)
- [S1 module schematic](../schematics/s1-reference-modules.svg)
