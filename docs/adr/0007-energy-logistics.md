# ADR 0007: Energy Logistics

- Status: Accepted
- Date: 2026-07-10

## Context

Cars need onboard power for lighting, effects, communications, sensing, stabilization, and possibly limited local control. Longer missions may require more stored energy than a single payload car should carry. Regenerative braking can also return energy to the system.

## Decision

Treat energy as a routable network resource.

ATOS will support dedicated battery or power cars that can be staged in charging sidings, joined to temporary consists, share power while coupled, leave service when depleted, and be replaced by charged assets along a route.

The initial hardware direction is:

- Guideway provides primary propulsion and electromagnetic braking.
- Vehicles carry local storage for onboard systems.
- Stations and selected guideway sections provide charging.
- Regenerative braking returns energy to a shared guideway, station, or storage bus where practical.
- Car-to-car power sharing may initially use magnetically aligned guarded contacts; contactless sharing remains an experiment.

Dispatch considers state of charge, usable capacity, battery health, mission energy estimate, reserve margin, charger availability, and the cost of repositioning energy assets.

## Consequences

- Battery cars are both vehicles and movable energy inventory.
- Energy balancing creates its own contracts and chits.
- A consist can be sized according to route demand instead of carrying fixed excess energy.
- Charging yards and power-car staging capacity become potential deficiency gates.
- Electrical protection must isolate a failed car as the smallest practical fault domain.

## Validation

Simulation must demonstrate battery-car assignment, depletion, charging, replacement, and energy-deficiency reporting. Hardware tests must validate safe coupling, current limiting, fault isolation, and regenerative braking before power sharing is scaled.