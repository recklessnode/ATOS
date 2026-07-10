# ADR 0003: Universal Chit Schema

- Status: Accepted
- Date: 2026-07-10

## Context

Passenger, cargo, energy, maintenance, and repositioning demands differ in meaning but share common scheduling constraints: origin, destination, readiness, due time, capacity, handling sensitivity, priority, and penalties.

## Decision

Normalize atomic demand into a universal chit schema. Contracts describe desired outcomes; contracts may decompose into one or more chits. A chit is the smallest schedulable and independently fail-able unit of work.

The schema must support:

- Passenger and cargo quantities.
- Mass, volume, capacity, and feature requirements.
- Ready and due times.
- Wait, lateness, stop, transfer, handling, and energy penalties.
- Required and forbidden capabilities.
- State transitions and parent contract traceability.

PostgreSQL is the required database target. SQL must remain PostgreSQL-compliant.

Derived PostgreSQL views or CTEs will classify each chit into one or more vehicle requirement classes without duplicating the source demand model.

## Consequences

- Dispatch can compare heterogeneous demands through a shared scoring model.
- Passenger and cargo classes are represented by populated attributes and policy, rather than completely separate scheduling tables.
- Specialized manifests can retain domain-specific details while referencing a universal chit.
- Partial fulfillment and failure can be recorded at chit level.

## Validation

The schema must represent commuter passengers, express passengers, local cargo, regional cargo, long-haul cargo, time-critical cargo, battery support, preventive maintenance, fault response, and empty repositioning without altering the core table for each case.