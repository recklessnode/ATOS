# Design Precedents

This document records patterns worth adapting from city-building and factory-logistics games. It is not an attempt to clone their exact mechanics.

## OpenSC2K and SimCity-style city simulation

Useful pattern: **buildings participate in regional systems rather than operating only as isolated machines**.

Adaptations for ATOS:

- set pieces have local inventories and behavior, but also contribute to district-level demand and fields
- homes, jobs, schools, churches, shops, services, transport, and utilities influence one another
- population can begin as aggregated cohorts rather than thousands of individual agents
- occupancy and activity emerge from access, capacity, schedule, and demand
- physical placement changes adjacency, service reach, travel cost, and district identity

Avoid making every social outcome a transported cargo. Education, community, desirability, pollution, and happiness are usually derived regional metrics, while people and goods remain explicit resources.

OpenSC2K itself is an incomplete open-source reimplementation of SimCity 2000, so it is most useful as a code-reading reference for map and simulation organization, not as the sole architecture authority.

## Factorio

Useful patterns:

- explicit item types and recipes
- finite machine inventories
- throughput and bottlenecks
- backpressure rather than invisible disposal
- trains and stations as part of a larger logistics network
- circuit-like signals for automation
- data-driven prototypes and reusable blueprints

Adaptations for ATOS:

- every transform is a recipe with reserved inputs, duration, requirements, and outputs
- every transfer passes through a finite-capacity port
- buildings use pull and push thresholds while ATOS contracts coordinate higher-level work
- set-piece definitions are data-driven and schema-versioned
- tile groups and arrangements can eventually be saved as reusable physical-world blueprints

Difference: ATOS must reconcile simulation with real hardware and must preserve safety-critical movement under power and communications faults.

## Mindustry

Useful patterns:

- one coherent model spans items, liquids, power, logic, transport, and combat units
- distribution topology matters
- power shortages degrade the network
- compact blocks expose clear input/output behavior
- logic can coordinate many devices without hardcoding every arrangement

Adaptations for ATOS:

- maintain overlapping graphs for power, data, track, pedestrian movement, and material transfer
- tiles advertise topology and enforce local constraints
- resource and power flow are visible, measurable, and capacity-limited
- behaviors issue requests through bounded policies rather than directly mutating the world
- simple set pieces can remain passive while nearby active tiles interpret them

Difference: ATOS separates authoritative simulation state from presentation, allowing lights, motors, and ambience to shed without losing inventory state.

## Satisfactory

Useful patterns:

- distinct transport tiers and interfaces
- machines advertise rates and power requirements
- logistics becomes easier to understand when ports and direction are visually and mechanically explicit
- trains, stations, freight platforms, and power form coordinated systems
- player-built factories remain inspectable even at large scale

Adaptations for ATOS:

- expose semantic ports and transfer rates on every entity definition
- make station subfunctions independently addressable: platform, charger, crossing, cargo handling, maintenance
- treat vehicle loading, unloading, dwell, and platform compatibility as real operations
- expose utilization, starvation, blockage, and power state in software diagnostics and physical effects

Difference: the hex fabric can reconfigure the infrastructure beneath the payload, so the same tile hardware serves track, buildings, audio, charging, or passive support.

## Common durable principles

Across these games, the reusable ideas are:

1. **Typed resources** — meaning is explicit and machine-readable.
2. **Finite inventories** — capacity creates planning and visible state.
3. **Explicit ports** — movement occurs through inspectable interfaces.
4. **Recipes and rates** — transformations take time and have requirements.
5. **Graphs and topology** — connectivity matters as much as total capacity.
6. **Backpressure** — congestion propagates rather than being hidden.
7. **Data-driven content** — new entities reuse engine primitives.
8. **Layered control** — local automation and global planning coexist.
9. **Readable feedback** — lights, motion, audio, and UI explain state.
10. **Graceful failure** — important systems survive by degrading lesser ones.

## ATOS-specific synthesis

ATOS combines these principles with a physical operating system:

- the hex field is a discoverable power-and-data substrate
- payload placement instantiates simulation entities
- ATOS contracts and chits convert demand into work
- transient super workers assemble vehicles, station capacity, energy, and routes for a mission
- effects project world state into physical light, motion, and spatial audio
- safety-critical mobility remains locally enforced and higher priority than scenery

## References

- OpenSC2K project: https://github.com/rage8885/OpenSC2K
- Factorio Wiki: https://wiki.factorio.com/
- Mindustry documentation: https://mindustrygame.github.io/wiki/
- Satisfactory Official Wiki: https://satisfactory.wiki.gg/
