# ADR 0008: Generalized Physical World Contract

## Status

Accepted

## Context

ATOS must support a physical city-builder and factory-logistics world assembled from snap-together hex tiles. Track, stations, buildings, scenery, cargo, and vehicles have different physical purposes but repeatedly need the same concepts: identity, capacities, inventories, ports, power, data, sensing, transformations, movement, maintenance, and presentation effects.

A design based on special-purpose classes for every set piece would become brittle. It would duplicate logic across buildings and vehicles, tightly couple gameplay to specific hardware, and make new content require engine changes.

The system must also tolerate load shedding. Presentation devices may lose power while the authoritative city and logistics simulation remains valid.

## Decision

ATOS will represent every tile, set piece, track component, cargo unit, and vehicle as a physical entity composed from a versioned capability vocabulary.

The common model includes:

- stable identity and type definition
- tile attachment and footprint
- typed inventories and finite capacities
- explicit transfer, movement, electrical, data, coupling, and effect ports
- timed recipes with requirements, inputs, and outputs
- demands converted into ATOS contracts and chits
- temporary vehicle consists and movement authorities
- operational hardware state and negotiated service grants
- declarative light, motion, and audio effects derived from authoritative state

The system separates definition state, authoritative simulation state, operational hardware state, and presentation state.

Track uses the same payload model but receives a safety-critical service class with deterministic local enforcement.

Content definitions will be data-driven and schema-versioned. Adding a new building or vehicle should normally require definitions and assets rather than modifications to the core engine.

## Consequences

### Positive

- one simulation language covers homes, factories, churches, stations, trains, and cargo
- capacities and resource flows remain inspectable and conserved
- new physical products can reuse existing engine capabilities
- presentation can degrade during power shortages without corrupting simulation state
- software-defined consists and station routing integrate naturally with city and factory demand
- tile-local audio and effects can render shared logical emitters

### Negative

- schemas and validation must be designed early
- generic systems can become difficult to understand without strong tooling and examples
- nested inventories and multi-graph routing increase implementation complexity
- capability versioning and hardware negotiation require discipline

### Risks

- an overly broad capability vocabulary could become an unstructured property bag
- abstract social metrics could be incorrectly modeled as physical cargo
- behaviors could bypass contracts and mutate state directly
- presentation code could accidentally become authoritative

These risks are controlled through typed schemas, bounded behavior policies, resource accounting, and explicit state-layer boundaries.

## Validation criteria

1. Define a house, apartment, church, factory, station, passenger car, freight car, shipping container, and track segment without adding type-specific engine code.
2. Move people and containers through explicit inventories and ports with conservation checks.
3. Form, split, and merge a temporary consist while preserving permanent car identities.
4. Pause a factory during power shedding without losing inventory or advancing production.
5. Render a moving train sound across tile speakers using one logical emitter and synchronized handoff.
6. Attach a multi-tile station whose footprint requests different service profiles from different tiles.
7. Add a new resource and recipe through data definitions and schema validation.

## Related documents

- [Physical World Architecture](../architecture/README.md)
- [Universal Chit Schema](0003-universal-chit-schema.md)
- [Software-Defined Consists](0004-software-defined-consists.md)
- [Station-as-Router Architecture](0005-station-as-router.md)
- [Energy Logistics](0007-energy-logistics.md)
