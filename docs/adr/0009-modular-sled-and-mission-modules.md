# ADR 0009: Modular Sled and Mission Modules

## Status

Accepted

## Context

ATOS vehicles must carry passengers, containers, bulk cargo, batteries, maintenance equipment, and future special-purpose payloads without creating a new vehicle architecture for every payload. Earlier ADRs define software-defined consists, stations as routers, energy logistics, and a generalized physical entity contract. Issue #17 adds the first printable S1 prototype kit, so the sled/module boundary needs to be explicit before CAD, manifests, and route admission checks harden around implicit assumptions.

The S1 prototype uses a permanent sled, a shared mission-module footprint, four module attachment stations, and a target module mass up to 1.5 kg. Issue #17 introduced the first printable defaults; Issue #21 recalibrates the current dimensional basis to a 320 mm length-over-coupler-faces assembly, a 300 mm printed sled body, and a 180 x 40 mm module footprint. These are prototype defaults, not production limits.

## Decision

ATOS will model the S1 vehicle as a permanent sled plus an interchangeable mission module.

The sled owns movement, guideway interface, coupling, permanent identity, local enforcement, attachment-state sensing, and measured mass-property observations when available.

The module owns passenger, cargo, energy, service, or experiment capability; declared mass and center of mass; envelope class; payload-shift risk; power/thermal requirements; and any module-specific route restrictions.

The composed sled/module vehicle is admitted to routes only after software checks the combined manifest and current measurements. Sled identity and module identity remain separate even when the pair moves as one vehicle.

The first printable prototype shall preserve the four-point module interface and shall not rely on electrical connectors for structural alignment or retention. Couplers are explicit replaceable prototype components with bounded yaw, vertical play, and dummy draft/compression limits.

## Consequences

### Positive

- Sled maintenance history and module capability history remain separate.
- Modules can be swapped without redefining the mobility platform.
- Route compatibility becomes software-checkable from mass, CG, envelope, power, and articulation data.
- The same sled can participate in passenger, cargo, battery-support, and test missions.
- Physical prototype tests can validate route admission assumptions before production hardware exists.

### Negative

- Every composed vehicle needs manifest validation, not just type matching.
- Incorrect module mass or CG data becomes a safety-relevant software input.
- Four-point attachment tolerances and datum control become critical prototype details.
- Split CAD parts and printable fixtures add validation burden.

### Risks

- Treating prototype limits as production limits could create false confidence.
- Cosmetic CAD changes could hide or weaken the standard interface.
- Modules with shifting payloads could pass static checks but fail dynamic route checks.
- Coupler hard stops, sensor disagreement, or vertical play could invalidate simple curve formulas.

These risks are controlled by visible datums, machine-readable manifests, conservative provisional limits, validation tooling, physical fixture tests, and explicit non-certification language.

## Validation criteria

1. A sled body and multiple mission modules share one parameterized S1 interface.
2. The printable kit exposes four attachment stations, datum marks, ballast features, and coupler geometry.
3. Machine-readable manifests describe sled, module, mass, CG, envelope, attachment, power, and route compatibility fields.
4. Route admission examples can reject missing mass data, excessive CG offset, envelope mismatch, coupler yaw excess, and degraded attachment or support states.
5. CAD validation reports bounding boxes, volumes, expected STL coverage, manifold status where measurable, and print-bed fit or split alternatives.
6. Documentation states that printed models are fit, geometry, packaging, clearance, and CG prototypes only.

## Related documents

- [Modular Sled Platform](../architecture/modular-sled-platform.md)
- [S1 1:87 Dimensional Basis](../engineering/s1-1-87-dimensional-basis.md)
- [Vehicles, Consists, and Routes](0004-software-defined-consists.md)
- [Generalized Physical World Contract](0008-generalized-physical-world-contract.md)
- [S1 Vehicle Dynamics and Loading Envelope](../engineering/s1-vehicle-dynamics-loading-envelope.md)
