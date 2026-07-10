# Design History: Modular Maglev Hex-City Concept

**Date:** July 2026  
**Status:** Working design history  
**Purpose:** Preserve the reasoning and concept evolution that led to the generalized ATOS physical-world architecture.

## 1. Starting point: a modular maglev trainset

The project began as a modular miniature maglev transportation system with several governing principles:

- minimize mechanically moving parts
- favor software-defined behavior over fixed mechanical arrangements
- allow train cars to operate semi-independently
- support dynamic consists rather than permanent trainsets
- track the identity, health, runtime, and maintenance state of each car
- allow stations to separate passenger, cargo, charging, and maintenance functions

A train is not treated as one monolithic object. It is a temporary coalition of cars assembled for a mission. Cars may join, split, recharge, exchange payloads, or be routed to maintenance independently.

## 2. Stations as active routers

Stations evolved from passive stopping points into active transport routers. A station can:

- identify approaching cars
- separate passenger, cargo, power, and maintenance cars
- route each car toward the correct platform, shed, charger, or handling system
- unload and reload cars according to their contents and contracts
- inspect car health and maintenance state
- reassemble a new consist for the next mission

This led to the ATOS doctrine that a station is a router and a train is a transient mission bundle.

## 3. Hex tiles as a blank infrastructure fabric

The tabletop then evolved into a field of snap-together hexagonal tiles. Each tile contains:

- power and ground distribution
- wired data connectivity
- neighbor discovery across six edges
- local control and protection circuitry
- payload identification
- local service negotiation
- optional sensing, audio, lighting, and actuation

The tiles are not permanently assigned as track tiles, building tiles, or station tiles. They form a blank physical computing fabric whose role is derived from what is placed on them.

A rough capital-Theta arrangement of tiles with a single power input was used as the conceptual example:

- track placed in an oval around the outer edge causes those tiles to become track-support infrastructure
- a station placed across the middle assigns different roles to its supporting tiles
- one station tile may provide high-current charging
- another may be mostly structural or dormant
- another may control platform lights, crossing arms, warning signals, and audio

The governing concept became:

> Tiles provide capabilities; payloads declare intent; software composes them into infrastructure.

## 4. Payload identity and service negotiation

Set pieces such as houses, factories, churches, schools, shops, stations, and track segments can identify themselves through NFC-like or other short-range mechanisms.

A payload can declare:

- identity and type
- footprint and orientation
- required power
- peak and continuous current
- data requirements
- latency class
- safety class
- lighting capability
- motion capability
- audio capability
- local sensing
- storage or cargo capacity
- optional local energy storage

The supporting tile or group of tiles grants a service profile based on available resources and priority.

Simple payloads may contain only passive identity. More advanced structures may include their own microcontroller, speaker, motor driver, sensors, or storage.

## 5. Audio as a first-class structural capability

Audio was explicitly added alongside light, motion, sensing, and power.

Three audio layers were identified:

1. **Structure-local audio** — speakers inside churches, stations, factories, houses, or vehicles.
2. **Tile-local audio** — speakers or surface exciters inside hex tiles for localized track sounds and environmental effects.
3. **District audio** — larger under-table speakers for low-frequency rumble and broad ambience.

Tile audio is especially important for spatial track sound. Train audio must follow a moving train with sufficiently low latency that it does not feel dubbed or detached.

The preferred method is local event-driven rendering rather than continuously streaming stereo audio. Track tiles receive scheduled events containing:

- train identity
- sound profile
- position
- velocity
- direction
- route
- start time on a shared clock
- gain and pitch parameters

Adjacent tiles crossfade the same logical sound source as the train moves across the layout.

## 6. Track as a payload with special privileges

Track became another payload class in the tile system, but one with safety-critical priority.

A track segment can declare:

- geometry
- orientation
- connectivity
- propulsion and levitation requirements
- occupancy sensing
- maximum current
- braking behavior
- supported route directions

When connected track pieces form a valid path or loop, the software recognizes them as a graph of specifically addressed track segments.

Track is conceptually a payload, but operationally receives:

- deterministic low-latency control
- reserved power
- local fail-safe behavior
- independent fault isolation
- priority over decorative loads

## 7. Dynamic routing and non-monolithic consists

Cars have permanent identities, while train consists and movement authorities are temporary.

The architecture distinguishes:

- **car identity** — permanent physical asset
- **consist identity** — temporary coalition of cars
- **movement authority** — temporary permission to use a reserved sequence or graph of track tiles

A route is not required to be a single permanent linear train path. Cars can split, merge, reorder, or travel semi-independently. Different groups of cars can receive separate route reservations after decoupling.

## 8. Distributed power and priority-based load shedding

The tile field evolved into a distributed microgrid rather than a passive power bus.

Power classes were discussed in descending priority:

1. protection, control, and fault communication
2. critical rail infrastructure
3. operational infrastructure such as station charging and platform systems
4. essential scenery state such as limited lighting
5. animated scenery such as motors and ambient audio
6. discretionary effects

A factory may therefore degrade from full operation to reduced mode to dormant mode while track propulsion and safety remain active.

Examples:

- shed a factory motor but keep basic lights on
- dim buildings before interrupting rail operations
- place buildings into dormancy during train acceleration
- restore scenery gradually after the train stops

The software should detect:

- voltage sag
- excessive current on one branch
- thermal stress
- unbalanced loading
- insufficient headroom
- overloaded tile-edge connections

It should recommend or accept additional power injection farther down the tile field to reduce transmission losses and supplement capacity.

A higher-voltage backbone with local conversion was favored over distributing low-voltage payload power across the entire layout.

## 9. Lessons from LEGO SMART Play and established train systems

The 2026 LEGO SMART Brick concept reinforced several architectural choices:

- distribute inexpensive identity widely
- place active interpretation nearby
- generate effects locally
- keep play physically understandable
- avoid requiring a screen for normal interaction

The project should borrow LEGO's interaction model but not rely on Bluetooth mesh for safety-critical track operation.

Other relevant lessons included:

- DCC-style unique addressing and logical consists
- physical programming through placed objects
- local autonomy in addressed devices
- integrated sound, light, and transport control

The ATOS tile rail remains the deterministic backbone, while wireless links are reserved for movable vehicles and optional payloads.

## 10. Every set piece becomes a stateful resource entity

Cargo capacity was expanded beyond train cars to all physical entities.

Examples discussed:

- factory: 50 units of raw iron, 6 shipping containers, 10 people
- church: 50 people
- house: 4 people
- apartment complex: 100 people
- train car: passengers, baggage, bulk goods, or containers

Every object can expose inventories, capacities, inputs, outputs, transformations, and behaviors.

Examples of state-driven presentation:

- empty house: lights off
- two people home: one or two rooms lit
- full house: several rooms lit
- lightly staffed factory: one furnace, reduced lighting, little motion
- fully staffed factory with material: full lighting, machinery audio, conveyors, and cranes
- crowded church: interior lights, bells, crowd audio, and parking activity

The authoritative state is occupancy or inventory. Light, motion, and audio are projections of that state.

## 11. Emergence of a physical city-builder and factory-management game

The concept grew beyond a trainset into a physical city-builder and resource-management game.

The world can model:

- people
- jobs
- housing
- passenger demand
- raw materials
- production chains
- containers
- cargo transport
- energy
- maintenance
- waste
- services
- abstract social resources such as education, community, and satisfaction

The logistics chain can emerge from generic contracts:

```text
Mine -> Ore Train -> Steel Mill -> Factory -> Container -> Warehouse -> Shop -> Household
```

The same engine can move people, freight, energy assets, maintenance crews, and other resources.

## 12. Generalized architecture direction

The durable architecture should use one shared contract for:

- tiles
- tracks
- buildings
- stations
- scenery
- cargo tokens
- train cars
- road vehicles
- power modules

Each entity declares:

- what it can store
- what it consumes
- what it produces
- what it transforms
- what ports it exposes
- how it can move or be moved
- what services it requires
- how it presents its state through light, motion, and audio

The system should be data-driven so a new set piece normally requires a new definition, not changes to the core engine.

## 13. Relationship to ATOS

This design history extends the existing ATOS architecture rather than replacing it.

- resources and capacities describe physical possibility
- recipes describe transformations
- contracts describe desired outcomes
- chits normalize work
- workers and transient super workers execute work
- stations route physical entities and resources
- software-defined consists remain temporary mission bundles
- the tile fabric supplies power, topology, addressing, safety, and presentation

## 14. Open design questions

The following remain intentionally unresolved:

- exact tile edge connector and bus design
- backbone voltage
- payload power-transfer mechanism
- local tile MCU and audio hardware
- train-to-track localization method
- authority split between central dispatcher and tile controllers
- persistence model for removable payloads
- simulation tick rate and world-time acceleration
- cargo unit normalization
- how much state is stored physically on each object
- whether figures and cargo tokens are individually identified or represented as aggregate quantities

These questions should be resolved through ADRs and prototypes while preserving the principles above.
