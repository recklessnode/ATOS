# ADR 0005: Station-as-Router Architecture

- Status: Accepted
- Date: 2026-07-10

## Context

Stations must do more than stop trains. They must sort independently addressable cars, unload and load different payload classes, charge energy assets, perform diagnostics, and reassemble outbound consists.

## Decision

Treat each station as a service router with distinct physical and software service zones:

- Passenger platforms.
- Cargo depots and handling bays.
- Maintenance sheds.
- Rapid charging and energy yards.
- Staging and assembly sidings.

As a consist approaches and slows, the station and dispatch system classify each car by manifest, destination, state of charge, health, and next required service. Cars are decoupled and routed to the appropriate zone, then returned to the available asset pool when their state permits.

## Consequences

- Platform, depot, charger, maintenance, and staging capacities become first-class resources.
- Station congestion can prevent otherwise feasible deliveries.
- Cars may autonomously progress through unload, inspection, maintenance, charging, reload, staging, and launch states.
- Physical switching should minimize moving parts and preferably use controlled magnetic guidance.

## Validation

A three-bay prototype or simulation must correctly route passenger, cargo, and battery or maintenance cars from a mixed arriving consist and make cleared cars available for new missions.