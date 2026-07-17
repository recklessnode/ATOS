# Physical World Architecture

This directory defines the generalized simulation and hardware contract for the ATOS hex-tile world.

The central idea is that tracks, buildings, stations, machines, scenery, train cars, road vehicles, and portable power modules are all **physical entities** attached to a common tile fabric. Each entity declares what it can contain, consume, produce, transform, sense, and express through light, motion, audio, and other effects.

## Documents

- [Physical World Model](physical-world-model.md) — durable domain model and simulation boundaries.
- [Entity Capability Contract](entity-capability-contract.md) — common contract for tiles, set pieces, and vehicles.
- [Resources, Recipes, and Logistics](resources-recipes-logistics.md) — inventories, transformations, demand, and transport.
- [Hex Tile Runtime](hex-tile-runtime.md) — topology, power, data, payload discovery, and scheduling.
- [Vehicles, Consists, and Routes](vehicles-consists-routes.md) — cargo vehicles, dynamic consists, and addressed movement authorities.
- [Modular Sled Platform](modular-sled-platform.md) — reusable mobility sleds and removable passenger, cargo, and energy modules.
- [Effects and Spatial Audio](effects-spatial-audio.md) — state-driven light, motion, and low-latency sound.
- [Design Precedents](design-precedents.md) — lessons adapted from OpenSC2K, Factorio, Mindustry, and Satisfactory.
- [Worked Examples](worked-examples.md) — houses, church, factory, station, and train examples.

## Design rules

1. Physical identity and simulated state are separate.
2. Every entity uses the same capability vocabulary.
3. Resources move through explicit ports and inventories.
4. Recipes transform resources over time and under constraints.
5. Effects are projections of state, not the source of state.
6. Safety-critical track control remains deterministic and local.
7. The simulation may degrade presentation loads without corrupting authoritative state.
8. Definitions are data-driven and versioned so new set pieces do not require core-engine changes.
