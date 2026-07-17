# Modular Sled Platform

## Status

Provisional prototype architecture for S1 printed dummy models.

This document defines the mechanical and software boundary between an ATOS sled and interchangeable mission modules. It is not a release-to-manufacture specification and does not certify structural, passenger, battery, electrical, or maglev hardware.

## Purpose

The S1 sled is a reusable mobility platform. It owns movement, coupling, identity, sensing, and the standardized mechanical interface. A mission module owns the passenger, cargo, energy, service, or experiment function installed on top of the sled.

Keeping the sled identity separate from module identity lets ATOS:

- swap modules without losing permanent sled health history;
- form software-defined consists from physical sleds;
- admit or reject routes based on the composed sled/module envelope;
- test center of mass, ballast, and route clearance before hardware is finalized;
- evolve modules without redefining the sled movement interface.

## S1 baseline geometry

The current printable prototype uses configurable Issue #21 defaults derived from the 1:87.1 dimensional basis:

| Parameter | Default |
|---|---:|
| Length over coupler faces | 320 mm |
| Printed sled body length | 300 mm |
| Structural deck length | 286 mm |
| Sled body width | 42 mm |
| Stabilization envelope width | 48 mm |
| Deck height above guideway datum | 12 mm |
| Module footprint | 180 x 40 mm |
| Module attachment stations | 4 |
| Prototype target module mass | up to 1.5 kg |

These values are starting points for printed fit and loading experiments. The full-size assumptions, purchased HO container pocket dimensions, and comparison with the earlier wider prototype are documented in `docs/engineering/s1-1-87-dimensional-basis.md`. Measured replacements belong in the versioned CAD parameters, manifests, and `docs/engineering/s1-vehicle-dynamics-loading-envelope.md`.

## Datums

S1 uses the coordinate system from the loading-envelope document:

- X longitudinal, positive toward the declared front;
- Y lateral, positive left when facing forward;
- Z vertical, positive upward.

The important datums are:

| Datum | Meaning |
|---|---|
| G0 | Guideway reference plane |
| D0 | Top of structural sled deck |
| C0 | Coupler pivot datum |
| M0 | Module interface datum |
| X0 | Longitudinal center plane |
| Y0 | Lateral center plane |

All printed reference parts should carry visible datum marks so physical measurements can be tied back to the software manifests.

## Sled responsibilities

An S1 sled owns:

- permanent sled identity and maintenance state;
- guideway interface, support or levitation nodes, and local movement enforcement;
- coupler pivots, drawbar interfaces, articulation sensors when fitted, and safe uncoupling features;
- module presence and attachment state;
- low-level power/data negotiation with the tile fabric and module;
- measured mass-property observations when available;
- route-admission state for the composed sled/module vehicle.

The sled must not assume that one module class maps to one route class. Route admission is based on the composed manifest and current measurements.

## Module responsibilities

A mission module owns:

- module identity and type;
- tare mass and declared center of mass;
- payload capacity, payload shift risk, and envelope class;
- passenger, cargo, energy, service, or experiment capabilities;
- module-side attachment features;
- power and thermal requirements;
- route restrictions that are stricter than the sled baseline.

The module does not own sled movement authority. It contributes constraints that the sled, dispatch planner, and route checker must honor.

## Four-point interface

The S1 prototype keeps a four-point module interface unless a later reviewed engineering change replaces it. The four attachment stations provide:

- repeatable X/Y module location;
- anti-lift retention;
- anti-shear load paths for dummy testing;
- visible inspection access;
- clear separation between structural retention and any electrical connector.

The electrical connector must not be used as the primary alignment or retention feature.

## Coupling and consists

S1 sleds can operate alone or as members of software-defined consists. Coupling is a mechanical constraint and a software relationship:

- the physical coupler defines yaw range, vertical play, drawbar length, and draft/compression limits;
- ATOS represents the consist as a temporary coalition of permanent sled identities;
- route admission checks the aggregate consist geometry and each local coupler angle;
- split, merge, and reorder operations are explicit transactions.

For the printed prototype, couplers are replaceable dummy parts used for low-speed geometry and articulation tests only.

## Center-of-mass experiments

The printable kit shall support controlled mass-property testing:

- ballast pockets in all four quadrants;
- a longitudinal ballast channel;
- an optional elevated ballast mount;
- module and sled CG marker locations;
- four support/load-cell fixture geometry;
- repeatable removable ballast for open-bin and asymmetric-load experiments.

Ballast features are test instrumentation, not production packaging.

## Software route admission

Before a composed S1 vehicle enters a route, software checks should include:

- sled and module identity;
- interface-version compatibility;
- attachment state at every required station;
- total mass;
- CG X/Y/Z;
- support-node loads and imbalance;
- static envelope and swept envelope;
- minimum curve radius;
- coupler articulation;
- acceleration, braking, and jerk limits;
- power and thermal needs;
- platform and station clearance;
- payload-shift risk;
- degraded support, coupler, sensor, or power state.

The machine-readable manifests under `schema/examples/` are examples of this admission contract.

## Validation artifacts

Issue #17 created the first S1 printable prototype kit, and Issue #21 recalibrates that kit around the 1:87.1 dimensional basis:

- parametric OpenSCAD in `cad/s1/`;
- generated STL assets in `cad/s1/stl/`;
- generated H2C-oriented 3MF projects in `cad/s1/3mf/`;
- printable fixtures for CG, articulation, and clearance testing;
- machine-readable manifests in `schema/examples/`;
- validation tooling in `tools/cad/`;
- the provisional loading envelope and dimensional basis in `docs/engineering/`.

All outputs remain prototype evidence until measured physical test results replace assumptions through reviewed revisions.
