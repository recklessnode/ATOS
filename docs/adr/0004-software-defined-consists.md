# ADR 0004: Software-Defined Consists

- Status: Accepted
- Date: 2026-07-10

## Context

Cars are intended to be semi-independent, stateful assets. Fixed trainsets would reduce flexibility, complicate maintenance isolation, and prevent dynamic energy and capacity allocation.

## Decision

Cars do not permanently belong to trains. Dispatch forms temporary consists to satisfy the current pool of chits.

A consist is a transient super worker composed of compatible workers such as passenger cars, cargo cars, battery cars, service cars, and control or sensor assets.

Formation considers:

- Destination and route compatibility.
- Capacity and payload requirements.
- State of charge and route energy reserve.
- Vehicle health and maintenance state.
- Coupling and power-sharing compatibility.
- Stop and interruption sensitivity.
- Priority of all unsatisfied chits.

## Consequences

- Consists may form, split, reorder, or exchange battery/support cars during a mission.
- A failed or depleted car can be removed without retiring a complete trainset.
- Dispatch must manage reservations, coupling state, neighboring cars, and consist lifecycle.
- Stations require staging space and autonomous sorting behavior.

## Validation

A simulation must demonstrate that changing demand causes different consists to emerge without manually scripting trains, and that individual cars can leave or join service without invalidating unrelated chits.