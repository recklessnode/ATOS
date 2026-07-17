# S1 1:87 Dimensional Basis

## Status

Provisional Issue #21 engineering basis for the S1 printable prototype family.

This document recalibrates the S1 vehicle family around a common 1:87.1 project scale. It is a dimensional study for printed fit, packaging, route-clearance, center-of-mass, and appearance prototypes. It is not certified passenger, structural, battery, electrical, or maglev hardware.

## Scale Convention

Use 1:87.1 as the project scale unless a future reviewed revision changes the basis.

Conversion:

- model millimeters = full-size millimeters / 87.1
- full-size meters = model millimeters * 87.1 / 1000

The design is "HO-world compatible", not a copy of conventional railway proportions. The S1 vehicle may be wider or taller than conventional HO rolling stock where ATOS guideway, stabilization, or payload assumptions justify it, but the basis must be stated.

## Multi-Scale Generation Addendum

The S1 CAD source stores the full-size design dimensions once and derives model dimensions by dividing by `s1_scale_ratio`. HO remains the baseline ATOS world-scale profile, but the generator can render the same full-size design at:

| Profile | Ratio | Output path | Asset policy |
|---|---:|---|---|
| N | 1:160 | `cad/s1/generated/n-1-160/` when generated | Supported by command; not committed in this addendum. |
| HO | 1:87.1 | `cad/s1/generated/ho-1-87/` | Generated assets committed. |
| O | 1:48 | `cad/s1/generated/o-1-48/` | Generated assets committed. |
| Custom | user supplied | `cad/s1/generated/<custom-name>/` | Generated on demand after validation. |

The generator command is documented in `cad/s1/README.md`. O-scale is regenerated from OpenSCAD source rather than by scaling finished HO STL files. The HO-to-O multiplier is about 1.815, but manufacturing details are not multiplied blindly.

Scale-dependent geometry includes:

- vehicle length, deck length, body width, stabilization envelope, support-node spacing, module footprint, pod heights, ballast-pocket locations, route-clearance envelope, container reference dimensions, and split clipping windows;
- derived curve, coupler, overhang, station-clearance, and swept-envelope report values.

Manufacturing parameters remain model-space defaults unless a future profile-specific manufacturing table revises them:

- wall thickness;
- printer tolerance;
- mount-pin and latch-slot dimensions;
- split-key dimensions;
- container fit clearances;
- side/end rail thicknesses;
- minimum feature assumptions.

This separation lets each model scale preserve the same full-size ATOS vehicle while keeping printer-driven details manufacturable. It also means a physical container fit test must use containers purchased for the selected model scale: HO containers for HO assets, O containers for O assets, and so on.

## Controlling Assumptions

| Item | Full-size assumption | 1:87.1 model dimension | Rationale |
|---|---:|---:|---|
| Length over coupler faces | 27.87 m | 320 mm | Long ATOS vehicle comparable to a modern articulated transit car section; retained from the earlier prototype because it is credible at HO scale. |
| Printed sled body length | 26.13 m | 300 mm | Distinct printable structural body; couplers account for the remaining length-over-faces. |
| Structural deck length | 24.91 m | 286 mm | Supports a 15.68 m module with front/rear fairing and ballast/testing features. |
| Sled body width | 3.66 m | 42 mm | Broad but credible automated guideway vehicle body, much narrower than the PR #20 dummy. |
| Stabilization envelope width | 4.18 m | 48 mm | Allows guide/stabilization hardware to protrude beyond the body while staying compatible with HO scenery. |
| Module footprint length | 15.68 m | 180 mm | Functional mission module mounted on the longer permanent sled. |
| Module footprint width | 3.48 m | 40 mm | Supports passenger aisle/seats and container retention while remaining HO-world compatible. |
| Deck height above G0 | 1.05 m | 12 mm | Low guideway-to-deck datum for station and clearance studies. |
| Standard ISO container width | 2.438 m | 28.0 mm | ISO reference for purchased HO containers. |
| Standard ISO container height | 2.591 m | 30.0 mm | Standard-height container clearance reference. |
| High-cube ISO container height | 2.896 m | 33.3 mm | Upper payload-height check for store-bought high-cube models. |
| 40-foot ISO container length | 12.192 m | 140.0 mm | The 40-foot adapter is a carrier for an actual purchased HO 40-foot container. |
| 20-foot ISO container length | 6.058 m | 70.0 mm | The twin-20 adapter carries two actual purchased HO 20-foot containers. |

## Vehicle and Module Envelopes

The module heights below are generated STL bounding boxes from `cad/s1/asset-report.md`. Top-above-guideway adds the 12 mm G0-to-deck datum. Container rows list both printed adapter height and payload-controlled height because the adapters are cradles, not printed container bodies.

| Vehicle/module | Model envelope basis | Full-size equivalent | Notes |
|---|---:|---:|---|
| S1 sled body | 300 x 48 x 17 mm | 26.13 x 4.18 x 1.48 m | Printed sled body; 48 mm width includes stabilization envelope. |
| S1 complete vehicle over coupler faces | 320 mm length | 27.87 m | Assembly dimension, not the sled-body STL length. |
| Commuter car | 320 x 48 x 50.6 mm | 27.87 x 4.18 x 4.41 m | 38.6 mm module above deck; passenger target below. |
| Overnight car | 320 x 48 x 56.6 mm | 27.87 x 4.18 x 4.93 m | Taller sleeper pod with lower service-speed expectations. |
| Battery car | 320 x 48 x 48.6 mm | 27.87 x 4.18 x 4.23 m | Low service-access and thermal-equipment pod. |
| 40-foot container car, adapter only | 320 x 48 x 21.5 mm | 27.87 x 4.18 x 1.87 m | Printed cradle without payload. |
| 40-foot container car, high-cube payload | 320 x 48 x about 51.5 mm | 27.87 x 4.18 x about 4.49 m | Uses an actual HO 40-foot container in the pocket. |
| Twin-20 container car, adapter only | 320 x 48 x 21.5 mm | 27.87 x 4.18 x 1.87 m | Printed cradle without payload. |
| Twin-20 container car, high-cube payload | 320 x 48 x about 51.5 mm | 27.87 x 4.18 x about 4.49 m | Uses two actual HO 20-foot containers in separate pockets. |
| Open-bin car | 320 x 48 x 48.6 mm | 27.87 x 4.18 x 4.23 m | Bulk/ballast payload volume with measured load-shift requirement. |
| Ballast/CG test car | 320 x 48 x 71.4 mm | 27.87 x 4.18 x 6.22 m | Intentionally tall test fixture for CG experiments, not a normal route-service envelope. |

## Passenger Capacity Basis

The printable pods do not contain detailed interiors, but claimed capacities must fit the full-size equivalent envelope.

### Commuter Pod

Assumptions:

- external module: 15.68 m long x 3.48 m wide x 3.36 m above deck;
- wall and technical allowance: 0.16 m per side and 0.35 m roof/floor service volume;
- usable interior width: about 3.16 m;
- aisle width: 0.70 m;
- seat module: about 0.48 m wide x 0.75 m pitch;
- door/service zones: two vestibules totaling about 3.2 m;
- usable seated cabin length: about 12.4 m.

Capacity basis:

- 8 rows of 2+2 transverse seats = 32 seated passengers;
- 2 vestibule/service zones with conservative density = 8 standing passengers;
- total planning capacity = 32 seated + 8 standing.

This is intentionally conservative for a 15.7 m automated car module and leaves space for doors, sensor cabinets, climate equipment, and the S1 interface structure.

### Overnight Pod

Assumptions:

- external module: 15.68 m long x 3.48 m wide x 3.88 m above deck;
- usable interior width after walls: about 3.16 m;
- central aisle width: 0.70 m;
- cabin/berth bay: about 1.8 m long, one side of the aisle, two stacked berths;
- end service/mechanical zones: about 3.0 m total.

Capacity basis:

- 6 berth cabins x 2 berths = 12 berths;
- no standing capacity credited for dispatch;
- lower acceleration and jerk limits than the commuter pod.

The overnight pod is taller than the commuter pod to make the berth stack plausible, but it remains within the route-clearance study envelope.

## Container and Payload Basis

The 40-foot and twin-20 adapters are not printed cargo boxes. They are printed retention cradles for actual store-bought HO-scale containers.

| Payload | Reference model size | Carrier pocket | Retained tray envelope | Decision |
|---|---:|---:|---:|---|
| 40-foot ISO container | 140.0 x 28.0 x 30.0 mm standard, 33.3 mm high cube | 141.5 x 29.2 mm | 149.5 x 33.2 mm | One purchased HO 40-foot container fits inside rails and end stops. |
| Two 20-foot ISO containers | 70.0 x 28.0 x 30.0 mm each, 33.3 mm high cube | two 71.5 x 29.2 mm pockets | 155.0 x 33.2 mm paired tray | Two purchased HO 20-foot containers fit with a 4 mm center separation. |

Clearance and retention allowances:

- length fit clearance: 1.5 mm per pocket;
- width fit clearance: 1.2 mm per pocket;
- end/handling retention allowance: 4.0 mm;
- side rail width: 2.0 mm;
- side/end rail height: 2.4 mm.

These values are deliberately inspectable in the generated CAD. Commercial HO containers vary by manufacturer, so physical fit testing should record the actual container make, measured length, width, height, corner-casting detail, and any sanding or shim used.

## Module-Specific Basis

| Module | Full-size role | Model basis | Intentional deviations |
|---|---|---|---|
| Commuter pod | Short-haul automated passenger service | 180 x 40 x 38.6 mm generated pod | Wider than conventional rail equipment, justified by ATOS guideway envelope and aisle/seating target. |
| Overnight pod | Sleeper/longer-duration passenger service | 180 x 40 x 44.6 mm generated pod | Tallest normal passenger pod to make stacked berth assumptions plausible. |
| Battery pod | Energy-support module with service access | 180 x 40 x 36.6 mm generated pod | Equipment volume is based on access and thermal packaging, not a certified battery pack. |
| 40-foot adapter | One purchased HO 40-foot container | 180 x 40 x 9.5 mm generated cradle | Printed height is low because payload height comes from the purchased container. |
| Twin-20 adapter | Two purchased HO 20-foot containers | 180 x 40 x 9.5 mm generated cradle | Two independent pockets avoid labeling a single long 240 mm block as two 20-foot containers. |
| Open bin | Bulk payload and shifting-load tests | 180 x 40 x 36.6 mm generated bin | Payload volume is for ballast and route-admission experiments, not a production hopper. |
| Ballast/CG test module | Instrumented center-of-mass exploration | 180 x 40 x 59.4 mm generated module | Intentionally exceeds normal car height to test CG rejection and test-only routing. |

## Station, Platform, Guideway, and Tile Impact

The recalibrated S1 envelope changes route-admission assumptions from the PR #20 dummy geometry.

Route and scenery assumptions for Issue #21:

- static body width: 42 mm;
- stabilization/swept hardware width: 48 mm;
- route clearance should reserve at least 5 mm per side beyond the swept envelope until measured guideway compliance exists;
- normal station/platform clearance should be checked against the 48 mm stabilization envelope and the module-specific height;
- overnight and container high-cube cases control normal vertical route clearance at about 57 mm above G0 before vertical margin;
- the ballast/CG test module is a test-only tall envelope and should not silently become a normal station-platform design driver;
- HO people, buildings, containers, and platform furniture should use 1:87.1 dimensions and should not be scaled to the older PR #20 64-77 mm vehicle width.

The generated route-clearance gauge (`cad/s1/stl/route_clearance_gauge.stl`) reflects the recalibrated station and guideway envelope as a physical inspection tool. The software route-admission examples remain semantic checks; no dispatch or simulation behavior is changed by this dimensional update.

## Comparison with PR #20 Geometry

| Dimension | PR #20 prototype | Issue #21 basis | Change |
|---|---:|---:|---|
| Length over coupler faces | 320 mm | 320 mm | Retained as a credible 27.87 m vehicle length. |
| Printed sled body length | conflated with 320 mm envelope | 300 mm | Body and coupler-face length are now distinct. |
| Structural deck length | 280 mm | 286 mm | Re-derived for the 180 mm module and 300 mm body. |
| Nominal sled/body width | 72 mm | 42 mm body, 48 mm stabilization envelope | Brings vehicle width back into a coherent HO-world range. |
| Module footprint | 240 x 64 mm | 180 x 40 mm | Re-derived from passenger, container, and equipment packaging. |
| Deck height above guideway | 30 mm | 12 mm | Lower station/platform datum and more plausible full-size vehicle height. |
| 40-foot cargo representation | 240 mm printed block | 140 mm purchased HO container pocket | Corrects the ISO container scale relationship. |
| Twin-20 cargo representation | two oversized printed blocks | two 70 mm purchased HO container pockets | Corrects the 20-foot container scale relationship. |

## Follow-Up Notes

- Dispatch, power, and simulation semantics are unchanged. They should consume revised envelopes only after a separate route-admission update if needed.
- Future CAD work may add optional container-specific shims if measured commercial container brands differ materially within a selected scale.
- Future profile work may add fixture-specific splits for oversized O-scale measurement tools that are validated as STL assets but omitted from H2C 3MF fixture plates.
- Physical testing must verify actual printer shrinkage, pocket fit, split-key fit, coupler seating, and measured CG before any route limits are strengthened.
