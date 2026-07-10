# ADR 0001: Project Doctrine

- Status: Accepted
- Date: 2026-07-10

## Context

ATOS is intended to explore a transportation system from first principles rather than reproduce conventional model-railroad assumptions. The project must remain testable, modular, and inexpensive to iterate.

## Decision

ATOS adopts the following doctrine:

1. Design around the smallest atomic unit of failure.
2. Everything is a test.
3. Fail fast, fail cheap, fail often.
4. Prefer the most elegant solution that survives testing.
5. Minimize mechanically moving parts.
6. Preserve observability, state history, and diagnostic explanations.
7. Begin in software simulation before committing to hardware complexity.

## Consequences

- Cars, guideway blocks, sensors, chargers, stations, contracts, and chits must be independently addressable.
- Failures should be isolated rather than cascade through an entire train or layout.
- Architectural choices must include measurable validation criteria.
- Temporary prototypes are expected and should be inexpensive to replace.

## Validation

A proposed subsystem is consistent with this ADR when it can be independently tested, instrumented, failed, replaced, and simulated without requiring the complete system.