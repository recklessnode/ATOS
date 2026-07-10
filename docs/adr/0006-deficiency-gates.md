# ADR 0006: Deficiency Gates

- Status: Accepted
- Date: 2026-07-10

## Context

An optimizer that leaves work unsatisfied without explaining why is difficult to improve. ATOS needs to identify not only what was dispatched, but which missing capability, capacity, location, or infrastructure prevented the queue from draining.

## Decision

Every unsatisfied chit must be evaluated against explicit deficiency gates. A chit may have more than one active gate.

Initial gate classes include:

- No compatible vehicle class available.
- Compatible vehicle too far from the origin.
- Insufficient passenger, mass, volume, or energy capacity.
- Insufficient state of charge or reserve.
- Required route unavailable, blocked, or congested.
- Origin loading or platform capacity unavailable.
- Destination unloading, charging, or maintenance capacity unavailable.
- Vehicle health or maintenance restriction.
- Manifest incompatibility.
- Coupling or power-bus incompatibility.
- Due time no longer feasible.

Deficiency records must identify the affected chit, observed condition, required threshold, current threshold, relevant location, and first time detected.

## Consequences

- The simulator can produce actionable infrastructure recommendations.
- Capacity planning becomes an output of dispatch rather than a separate manual exercise.
- Repeated gates can be aggregated into statements such as "two more commuter cars are needed near Station A" or "a cargo depot at Station C would remove the dominant bottleneck."
- A queue can remain partially unsatisfied while still producing a valid, explainable solution.

## Validation

For each intentionally constrained simulation scenario, the system must identify the correct limiting resource and distinguish asset shortages from infrastructure, routing, timing, maintenance, and energy deficiencies.