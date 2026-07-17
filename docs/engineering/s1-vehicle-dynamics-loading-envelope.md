# S1 Vehicle Dynamics and Loading Envelope

## Status

**Provisional prototype engineering baseline.**

This document defines conservative starting limits, calculations, route-admission rules, and test methods for dummy and low-speed S1 sled prototypes. The values are intended to guide 3D-printed fit, loading, center-of-mass, clearance, and curve experiments. They are not release-to-manufacture limits and must not be represented as certified passenger, structural, battery, or maglev safety values.

Measured results replace provisional limits only through a documented revision of this file and the associated machine-readable interface definitions.

## Purpose

The modular sled architecture allows the same mobility platform to carry passenger, battery, container, bulk, and specialty modules. That flexibility introduces variation in:

- total mass
- longitudinal, lateral, and vertical center of mass
- inertia
- body overhang and swept envelope
- coupler angle
- acceleration and braking demand
- load movement during operation

The objective is to make those variations explicit and software-checkable before a sled-module combination is admitted to a route.

## Normative language

- **Shall** indicates a required prototype rule.
- **Should** indicates a preferred design or test practice.
- **May** indicates an allowed option.
- **TBD-M** means the value must be replaced by measurement.
- **TBD-D** means the value depends on final guideway design.

## Coordinate system and datums

The S1 coordinate system is right-handed:

- **X:** longitudinal; positive toward the sled's declared front
- **Y:** lateral; positive to the left when facing forward
- **Z:** vertical; positive upward

The origin is the intersection of the sled longitudinal center plane, lateral center plane, and deck datum.

### Datums

| Datum | Definition |
|---|---|
| G0 | Guideway reference plane used for vehicle height and clearance |
| D0 | Top surface of the structural sled deck |
| C0 | Coupler pivot axis and nominal coupler height |
| M0 | Module interface plane at the mounting-station contact surfaces |
| X0 | Sled longitudinal center plane |
| Y0 | Sled lateral center plane |

All module manifests shall report center of mass relative to M0/X0/Y0 in millimeters.

## Baseline geometry

The values below inherit the Issue #21 1:87.1 dimensional basis and remain configurable. See [S1 1:87 Dimensional Basis](s1-1-87-dimensional-basis.md) for the full-size assumptions, purchased-container fit basis, and comparison with the earlier wider prototype.

| Parameter | Symbol | Provisional value |
|---|---:|---:|
| Length over coupler faces | `L_o` | 320 mm |
| Printed sled body length | `L_b` | 300 mm |
| Structural deck length | `L_d` | 286 mm |
| Overall sled body width | `W_s` | 42 mm |
| Stabilization envelope width | `W_stab` | 48 mm |
| Module footprint length | `L_m` | 180 mm |
| Module footprint width | `W_m` | 40 mm |
| Deck height above guideway datum | `H_d` | 12 mm |
| Nominal coupler pivot spacing | `L_p` | 278 mm |
| Provisional support-node longitudinal spacing | `S_x` | 176 mm |
| Provisional support-node lateral spacing | `S_y` | 30 mm |

The support-node spacings are analysis assumptions until the levitation, guidance, or passive-running arrangement is selected.

## Mass-property model

For a composed vehicle:

`m_total = m_sled + m_module + sum(m_payload_i)`

The composed center of mass is:

`r_CG = sum(m_i * r_i) / sum(m_i)`

where `r_i = [x_i, y_i, z_i]` is expressed in the S1 coordinate system.

The system shall retain both:

1. declared mass properties from the module manifest; and
2. measured or estimated mass properties from sled sensors or station test equipment.

A significant disagreement shall prevent normal route admission.

## Initial provisional prototype limits

These values are deliberately conservative for printed dummy models and low-speed testing.

| Parameter | Symbol | Initial prototype limit | Rationale |
|---|---:|---:|---|
| Empty sled design mass | `m_sled` | 0.80 kg target | Planning assumption pending CAD volume and hardware selection |
| Maximum module plus payload mass | `m_module` | 1.50 kg | Existing S1 concept target |
| Maximum composed mass | `m_total` | 2.50 kg | Adds margin above 0.8 + 1.5 kg |
| Longitudinal CG offset | `|x_CG|` | <= 30 mm | Keeps nominal load near central support polygon |
| Lateral CG offset | `|y_CG|` | <= 5 mm normal; <= 8 mm test-only | Strong control because lateral stability margin is narrow |
| CG height above deck | `z_CG,D0` | <= 45 mm normal; <= 65 mm instrumented test-only | Limits overturning moment for tall modules |
| Minimum static load at any support node | `F_node,min` | >= 10% of total weight | Prevents unloading of a support/guidance node |
| Maximum support-node load | `F_node,max` | <= 40% of total weight | Avoids excessive concentration before hardware is characterized |
| Maximum diagonal load imbalance | `I_diag` | <= 20% of total weight | Detects twist and asymmetric load conditions |
| Attachment-station proof target | `F_attach` | 3 x static local load | Dummy structural proof target, not passenger certification |
| Coupler draft/compression proof target | `F_cpl` | 25 N | Low-speed printed prototype target |
| Normal lateral acceleration | `a_y` | <= 0.30 m/s^2 | Gentle initial operations |
| Test-only lateral acceleration | `a_y,test` | <= 0.50 m/s^2 | Instrumented, unoccupied dummy tests only |
| Normal longitudinal acceleration | `a_x` | <= 0.40 m/s^2 | Reduces load transfer and coupler shock |
| Emergency prototype deceleration | `a_brake` | <= 0.80 m/s^2 | Dummy testing baseline pending braking design |
| Passenger comfort jerk | `j` | <= 0.50 m/s^3 | Initial comfort-oriented target |

### Limit hierarchy

A vehicle is constrained by the most restrictive of:

- sled limits
- module limits
- payload limits
- consist limits
- route limits
- current degraded-mode limits

Test-only values shall never be silently substituted for normal-service values.

## Support-node loading

For a four-node rectangular support approximation with nodes at `(+/-S_x/2, +/-S_y/2)`, the static node reactions may be estimated from total weight and CG offsets.

A simplified separable estimate is:

`F_front = W * (1/2 + x_CG / S_x)`

`F_rear = W * (1/2 - x_CG / S_x)`

`F_left = W * (1/2 + y_CG / S_y)`

`F_right = W * (1/2 - y_CG / S_y)`

The individual corner loads can be approximated by combining the longitudinal and lateral fractions. Final analysis shall use the actual support geometry and structural compliance.

The sled shall reject or derate a composition if any estimated node:

- falls below the minimum load fraction
- exceeds the maximum load fraction
- exceeds measured hardware capability
- disagrees materially with instrumented readings

## Curve geometry

## Provisional minimum radii

Until physical tests replace them, use:

| Configuration | Minimum centerline radius |
|---|---:|
| Solo sled, no module overhang beyond S1 envelope | 600 mm |
| Solo sled with full-length enclosed module | 650 mm |
| Two coupled S1 vehicles | 750 mm |
| Three or more coupled S1 vehicles | 900 mm |
| Reverse curve without tangent section | prohibited |
| Reverse curve with tangent section | tangent >= one coupler-pivot spacing, initially 278 mm |

These are layout and prototype-test starting values, not proven minima.

### Chord and mid-ordinate

For a rigid body represented by a chord of length `L` on a curve of radius `R`, the central angle is:

`phi = 2 * asin(L / (2R))`

The mid-ordinate, representing inward displacement of the chord center relative to the arc, is:

`e_mid = R - sqrt(R^2 - (L/2)^2)`

For small `L/R`:

`e_mid ~= L^2 / (8R)`

### End overhang

If the body extends distance `a` beyond the outer pivot/support point, its outside sweep shall be calculated from the actual rigid-body pose. A conservative early estimate is to model the entire body envelope at successive angular positions and compute the union of occupied points.

Analytic estimates may be used for preliminary work, but route clearance shall ultimately use polygon or mesh sweeping.

### Coupler articulation

For two equal vehicles following the same circular centerline, a first-order estimate of relative coupler yaw is based on the angular separation between adjacent pivot centers:

`theta_c ~= 2 * asin(L_p / (2R))`

This estimate shall be refined for:

- coupler drawbar length
- pivot offset from vehicle ends
- lateral coupler displacement
- unequal vehicles
- transition curves
- S-curves
- vertical grade transitions

Provisional requirements:

| Parameter | Initial value |
|---|---:|
| Normal coupler yaw capability | +/- 15 degrees |
| Mechanical hard-stop target | at least +/- 18 degrees |
| Route planning usable yaw | <= 80% of measured hard-stop angle |
| Allowed yaw-sensor disagreement | <= 2 degrees |

A route shall not be admitted if predicted articulation exceeds the usable yaw limit.

## Swept envelope

Each composed vehicle shall have an envelope model containing:

- static bounding box
- front and rear overhang
- lateral body profile
- module profile
- coupler sweep
- optional dynamic allowance

The route checker shall evaluate the swept envelope along:

- constant-radius curves
- transitions
- switches and junctions
- platform edges
- adjacent tracks
- reverse curves
- station module-handling zones

### Initial clearance allowances

For printed prototypes, add the following to the calculated static sweep:

| Allowance | Initial value |
|---|---:|
| Per-side manufacturing/assembly tolerance | 1.0 mm |
| Per-side dynamic motion allowance | 2.0 mm |
| Per-side route reserve | 2.0 mm |
| Total recommended clearance beyond predicted sweep | 5.0 mm per side |

These allowances shall be increased where guidance is compliant, payload can shift, or track alignment is uncertain.

## Dynamics

## Lateral acceleration

For speed `v` and curve radius `R`:

`a_y = v^2 / R`

Therefore the curve-speed ceiling is:

`v_max = sqrt(a_y,allowed * R)`

Example normal-service ceilings using `a_y,allowed = 0.30 m/s^2`:

| Radius | Maximum speed |
|---:|---:|
| 0.60 m | 0.424 m/s |
| 0.75 m | 0.474 m/s |
| 0.90 m | 0.520 m/s |
| 1.20 m | 0.600 m/s |

The route controller shall use the lowest allowed lateral acceleration among the sled, module, payload, consist, and route.

## Overturning moment

A simplified lateral overturning moment about a support edge is:

`M_overturn = m_total * a_y * z_CG`

The stabilizing gravitational moment for lateral half-spacing `b = S_y/2` and lateral CG offset `y_CG` is:

`M_stable = m_total * g * (b - |y_CG|)`

Define static/dynamic stability ratio:

`SR = M_stable / M_overturn`

For early dummy testing:

- normal route admission should require `SR >= 2.0`
- instrumented test-only operation should require `SR >= 1.5`
- any predicted support-node unloading is an automatic rejection regardless of calculated ratio

Active magnetic stabilization may add restoring capability later, but it shall not be credited until measured and bounded under fault conditions.

## Longitudinal load transfer

A simplified longitudinal load-transfer magnitude between front and rear support groups is:

`Delta F_x = m_total * a_x * z_CG / S_x`

The route checker shall combine this with static longitudinal CG offset and braking direction. The vehicle shall retain the minimum support-node load under both acceleration and braking cases.

## Coupler forces

For a simple consist under longitudinal acceleration:

`F_coupler ~= m_trailing * a_x + F_resistance`

Dynamic impact, slack, control latency, and emergency stopping can produce higher loads. Printed couplers shall initially be tested only at low speed and shall use replaceable sacrificial components where practical.

## Jerk

Jerk is:

`j = da/dt`

Passenger and shifting-load modules should use S-curve acceleration profiles. Abrupt changes are prohibited during normal operations even when peak acceleration remains below its limit.

## Dynamic derating

The following conditions shall reduce permitted speed and acceleration:

| Condition | Initial derating rule |
|---|---|
| CG height above 45 mm | test-only until characterized |
| Lateral CG offset 5-8 mm | reduce curve speed by at least 30% |
| Partially filled open bin | reduce curve speed and acceleration by at least 50% unless load is restrained |
| Liquid or granular load free to move | test-only; require load-shift model |
| Tall passenger or battery pod | apply module-specific `a_y` limit |
| One stabilizer/support degraded | stop or crawl to nearest safe siding; no normal dispatch |
| Uncertain mass or CG | reject normal service |
| Coupler-angle sensor degraded | prohibit curves requiring more than 50% of mechanical yaw range |

## Module-specific considerations

### Commuter passenger pod

- occupancy changes mass and CG continuously
- passengers shall be represented conservatively as distributed mass with an allowed lateral asymmetry case
- normal operations should use the passenger jerk target
- doors and boarding mechanisms must be closed and verified before route admission

### Overnight passenger pod

- baggage location must be included
- upper berths may raise CG
- lower acceleration and jerk limits may be appropriate

### Battery pod

- cell and enclosure mass should remain low and centrally located
- thermal system state is part of route admission
- battery isolation and emergency response requirements are separate from this mechanical envelope

### Container adapters

- each container position retains independent mass and CG data
- twin-20 operation with one empty position is an asymmetric special case
- containers shall be mechanically retained independently of module-to-sled retention

### Open-bin module

- load surface angle, compaction, and shift potential must be represented
- uneven or partially filled loads are not assumed centered
- removable ballast blocks should be used for early physical characterization

## Route-admission checks

Before dispatch, ATOS shall evaluate the composed sled-module vehicle and the intended route.

### Required checks

1. Identity and interface-version compatibility
2. Mechanical attachment confirmation at all required stations
3. Declared versus measured mass agreement
4. Total mass below all applicable limits
5. CG X/Y/Z inside permitted envelope
6. Static and dynamic support-node loads
7. Module and body envelope class
8. Minimum-radius compatibility
9. Predicted coupler articulation
10. Swept-envelope clearance
11. Longitudinal acceleration and braking margin
12. Lateral acceleration and stability ratio
13. Payload-shift risk
14. Power and thermal requirements
15. Platform, station, and module-handling compatibility
16. Degraded sensors, supports, stabilizers, or couplers

### Suggested mass-property disagreement thresholds

Until measurement uncertainty is characterized:

- mass difference greater than 5% or 50 g, whichever is larger: hold for inspection
- longitudinal CG disagreement greater than 5 mm: hold for inspection
- lateral CG disagreement greater than 2 mm: hold for inspection
- CG-height disagreement greater than 10 mm: test-only or reject

## Machine-readable example

```yaml
vehicle_composition:
  sled_id: sled-s1-0042
  module_id: module-commuter-0018
  interface_class: S1
  state: candidate

mass_properties:
  sled_mass_kg: 0.78
  module_tare_mass_kg: 0.62
  payload_mass_kg: 0.54
  total_mass_kg: 1.94
  cg_mm:
    x: 8.0
    y: -1.5
    z_above_deck: 37.0
  measurement_uncertainty:
    mass_kg: 0.03
    x_mm: 2.0
    y_mm: 1.0
    z_mm: 5.0

geometry:
  static_envelope_class: S1-P180
  minimum_curve_radius_mm: 750
  maximum_coupler_yaw_deg: 15
  dynamic_clearance_allowance_mm: 5

limits:
  max_lateral_acceleration_mps2: 0.30
  max_longitudinal_acceleration_mps2: 0.40
  max_braking_deceleration_mps2: 0.80
  max_jerk_mps3: 0.50

payload:
  type: passengers
  count: 40
  shift_risk: low

route_admission:
  requested_route: loop-a-platform-2
  result: pending
  checks:
    mass: pass
    cg: pass
    support_loads: pass
    radius: pass
    coupler_articulation: pass
    swept_envelope: pass
    braking: pass
    power_thermal: pass
```

## Failure cases and required responses

### Missing or invalid module mass data

- Do not admit to a normal route.
- Permit only station fixture measurement or restricted crawl under direct supervision.

### Misreported center of mass

- Compare declared and measured values.
- Quarantine the module after threshold disagreement.
- Preserve both readings in the maintenance/event history.

### Attachment point not seated

- Do not energize high-power module contacts.
- Do not move except for a controlled reseating procedure.

### Support or stabilizer degraded

- Recalculate limits without crediting the failed element.
- Default response is safe stop.
- Restricted movement to maintenance is allowed only under an explicitly validated degraded mode.

### Uneven open-bin load

- Detect through support-node imbalance or station measurement.
- Relevel, restrain, or reject the module.
- Do not assume bulk material will self-center during motion.

### Coupler articulation sensor failed

- Use a conservative fixed route restriction.
- Prohibit complex junctions and tight curves.
- Require maintenance before dynamic split/merge operations.

### Envelope exceeds route clearance

- Reject the route and find an alternate route or module/sled assignment.
- Never rely on low speed to resolve a geometric collision.

### Power loss

- Preserve braking, stabilization, identity, and safe uncoupling energy as long as designed.
- Enter a deterministic safe-stop state.
- Revalidate attachment and mass-property state before resuming.

## Prototype test program

All tests shall record configuration, material, print settings, ballast locations, measured mass properties, guideway geometry, software version, and environmental conditions where relevant.

## T01: Dimensional inspection

**Method**

- Measure datums, mounting-point positions, deck flatness, overall envelope, coupler pivot position, and module footprint.

**Initial pass criteria**

- Critical interface positions within +/-0.25 mm after printer calibration
- General envelope within +/-0.50 mm
- No interference preventing full module seating

## T02: Interface fit and repeatability

**Method**

- Install and remove each reference module ten times.
- Inspect locating features, latches, and connector alignment.

**Pass criteria**

- Full seating without tools unless the design intentionally requires a tool
- No structural damage
- Repeatable final position within 0.25 mm laterally and longitudinally
- Presence state detected on every cycle when sensors are fitted

## T03: Static deck deflection

**Method**

- Apply distributed and worst-case offset ballast up to maximum prototype mass.
- Measure deck and interface deflection.

**Initial pass criteria**

- No permanent deformation
- Deflection does not cause latch release or connector structural loading
- Target deck deflection <= 0.5 mm at maximum dummy load

## T04: Module retention proof

**Method**

- Apply vertical, lateral, and longitudinal loads through the module using a controlled fixture.

**Pass criteria**

- Withstand 3 times calculated static local attachment load without release
- Withstand 25 N longitudinal dummy-test load without coupler/module separation
- No cracking at latch or mounting features

## T05: Center-of-mass measurement

**Method**

- Use a four-point scale/load-cell fixture for X/Y.
- Use a tilt, suspension, or multi-orientation method for Z.
- Test centered, longitudinally offset, laterally offset, and elevated ballast configurations.

**Pass criteria**

- X and Y repeatability within 2 mm
- Z repeatability within 5 mm
- Measured values agree with known ballast configuration within stated uncertainty

## T06: Static tilt margin

**Method**

- Place the composed vehicle or representative support fixture on a gradually tilting platform.
- Test worst-case allowed CG configurations.

**Pass criteria**

- No support unloading or loss of guidance below the predicted threshold
- Measured onset agrees with the model within 15%
- Normal envelope retains the selected stability margin

## T07: Minimum-radius solo curve

**Method**

- Run each reference module through 900, 750, 650, and 600 mm radii as applicable.
- Begin at crawl speed and increase only within lateral-acceleration limits.

**Pass criteria**

- No body, module, coupler, or guideway interference
- No attachment movement
- No support-node unloading
- Predicted and observed sweep agree within clearance allowance

## T08: Coupled curve and reverse curve

**Method**

- Test two- and three-vehicle consists.
- Include a reverse curve with the provisional 278 mm tangent.

**Pass criteria**

- Coupler yaw remains below usable limit
- No hard-stop contact in normal route geometry
- No vehicle-to-vehicle or vehicle-to-infrastructure interference
- No compressive buckling or abnormal drawbar behavior at low speed

## T09: Swept-envelope gauge

**Method**

- Use a physical clearance gauge or measured scan around curves, switches, and platform edges.

**Pass criteria**

- At least 5 mm clearance beyond predicted static sweep for the initial prototype
- No unmodeled projection enters the clearance envelope

## T10: Longitudinal dynamics

**Method**

- Command controlled acceleration, braking, and S-curve profiles with instrumented ballast.

**Pass criteria**

- Acceleration, deceleration, and jerk remain within commanded limits
- No latch movement or coupler damage
- Dynamic support-node loads remain within limits

## T11: Asymmetric and shifting-load test

**Method**

- Use removable ballast to simulate one-sided passenger loading, single-position twin-20 loading, and partially filled open-bin loads.

**Pass criteria**

- Admission logic correctly accepts, derates, or rejects each case
- Physical behavior remains bounded within the approved test envelope
- Shift-sensitive loads do not enter normal service without restraint or a validated model

## T12: Swap repeatability

**Method**

- Swap at least three modules among at least two sleds while preserving identities and mass-property records.

**Pass criteria**

- Correct sled and module identity after every swap
- Correct route limits recomputed after every composition
- No stale limits retained from the prior module

## Replacing provisional values

A provisional value may be promoted only when:

1. the relevant geometry is frozen to a versioned prototype revision;
2. the test method and instrumentation are documented;
3. repeated measurements include uncertainty;
4. failure behavior is understood;
5. the proposed limit includes a stated margin;
6. route-admission software and manifests are updated together; and
7. an ADR or reviewed engineering change records the decision.

## Open engineering items

- final support/levitation node geometry
- magnetic guidance and stabilization force curves
- structural material and print-or-manufacture method
- coupler drawbar geometry and vertical articulation
- transition-curve design
- final station and adjacent-track clearance standards
- validated passenger comfort limits at model scale
- battery-module containment and thermal safety requirements
- load-cell or other onboard mass-property sensing architecture
- actual inertia values for representative modules
- dynamic simulation correlated to physical tests

## Relationship to other ATOS documents

- `docs/architecture/modular-sled-platform.md`
- `docs/architecture/vehicles-consists-routes.md`
- `docs/architecture/hex-tile-runtime.md`
- `docs/adr/0009-modular-sled-and-mission-modules.md`
- GitHub issue #17 for printable CAD, fixtures, manifests, and validation tooling
