# Hex Tile Runtime

## Role of the tile fabric

The snap-together hex tiles form a distributed physical-computing substrate. A blank arrangement has topology, power, data, sensing, audio, and payload-service capacity but no fixed gameplay identity. Placement assigns meaning.

Track, buildings, stations, roads, scenery, and power injectors are payloads that bind to one or more tiles. The runtime discovers the assembled field, authenticates payloads, negotiates services, and publishes the resulting world graph.

## Tile identity and topology

Every tile has a permanent hardware identity and six edge interfaces. At startup or topology change, tiles discover neighbors and establish:

- edge presence and orientation
- electrical continuity
- data-link quality
- route to one or more coordinators
- axial hex coordinates within the current field
- redundant paths when available

Coordinates are field-local. Persistent gameplay should bind primarily to stable entity IDs and attachment relationships, not assume that a tile always has the same coordinate.

## Edge interface

Each edge should provide, at minimum:

- protected DC backbone and return
- differential data
- neighbor-presence or identification support
- controlled connection and current measurement

Desirable protections include electronic fuse behavior, reverse-current blocking, soft start, temperature sensing, and edge isolation. A faulted edge must be isolatable without shutting down the entire field.

## Service domains

The tile runtime separates service domains even when they share hardware:

1. **protection and control** — always-on tile health, routing, and emergency state
2. **critical mobility** — occupied track, stabilization, propulsion, braking, interlocks
3. **operational infrastructure** — charging, platforms, signals, cargo handling
4. **essential presentation** — status and minimum lighting
5. **animated scenery** — motors and local activity
6. **discretionary presentation** — ambience and decorative effects

Power and bandwidth grants use these domains. Payload definitions may further describe interruptibility, restart cost, and safe degradation modes.

## Payload discovery

A tile detects a payload through NFC, near-field identification, contacts, inductive telemetry, or another standardized top-side interface.

Discovery sequence:

1. detect presence without applying unrestricted power
2. read identity and authentication claim
3. obtain type and capability manifest
4. determine footprint and orientation
5. validate required neighboring tiles
6. calculate power, data, latency, and safety requirements
7. grant a service profile
8. register the entity in the simulation
9. energize optional functions through controlled startup

Simple scenery may be passive and identified only. Advanced payloads may contain a controller, local effects, storage, and persistent state.

## Bulk assignment

Software may assign a group identity to a connected set of tile attachments:

- a closed loop of track becomes `Main Loop`
- three station tiles become `Central Station`
- a neighborhood becomes `Residential District A`
- a branching guideway becomes one route graph with separately addressed segments

Bulk identity does not erase individual tile addresses. Group commands are expanded or multicast while local enforcement remains per tile.

## Track mode

A track payload contributes geometry and capabilities to the movement graph. Its supporting tile enters track mode and exposes:

- addressed entry and exit edges
- occupancy and position observations
- movement-authority enforcement
- propulsion, levitation, stabilization, or braking service as applicable
- local spatial-audio emitter
- continuity and alignment state

Track is architecturally a payload but operationally receives safety-critical priority.

## Power distribution

Use a higher-voltage backbone with local conversion for payload rails. Each tile reports:

- voltage and current by edge
- local conversion load
- payload load by service domain
- temperature and fault state
- estimated upstream impedance and available headroom

The scheduler predicts train demand, reserves capacity, sheds lower-priority loads, and restores them in stages. It should detect persistent voltage drop, connector heating, unbalanced loading, and overloaded paths.

## Multiple power injection points

Power-source payloads authenticate and advertise voltage, continuous and peak capacity, reverse-current behavior, and fault policy. The field recomputes source zones and current paths when a source is added or removed.

The system may recommend an additional injection point based on electrical distance, measured loss, edge limits, expected train peaks, and redundancy. Sources must never be naively paralleled; compatibility and current-sharing policy are explicit.

## Brownout behavior

The runtime acts before voltage collapse:

- reserve critical mobility power
- pause or reduce train charging
- stop decorative motors
- reduce lighting brightness
- silence ambient audio
- place buildings into declared dormant modes

When the train becomes stationary and headroom returns, services restore with hysteresis and staggered startup. Simulation inventories and processes remain authoritative; recipes enter a defined paused or power-starved state rather than silently advancing.

## Data planes

A durable implementation should separate logical traffic classes:

- deterministic control and safety events
- topology, health, and power telemetry
- simulation state and commands
- time-synchronized audio and effects
- firmware and asset distribution

They may initially share one physical bus, but scheduling and priorities should preserve the distinction.

## Local autonomy

Tiles enforce electrical and safety limits locally. If coordination is lost:

- no new movement authority is granted
- occupied track transitions to its defined safe state
- uncertain crossings remain protected
- scenery is shed
- control, identity, and fault reporting remain powered where possible

Central software plans and optimizes; local tile controllers protect and enforce.

## Versioning

Tile firmware, payload manifests, and service contracts are versioned independently. Negotiation must support:

- minimum compatible version
- optional capabilities
- graceful fallback
- refusal of unsafe combinations
- field upgrade without requiring every payload to update simultaneously
