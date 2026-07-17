# S1 Printable Prototype Kit

This directory contains parametric OpenSCAD source and generated STL files for the provisional S1 modular sled prototype kit.

The parts are fit, appearance, packaging, route-clearance, and center-of-mass experiment models. They are not certified passenger-carrying, structural, electrical, battery-safety, or maglev hardware.

## Required software

- OpenSCAD 2021.01 or newer
- Python 3.11 or newer
- Optional Python mesh tooling from `tools/cad/requirements.txt` for manifold, volume, and bounding-box validation

Install the optional validation dependency with:

```bash
python3 -m pip install -r tools/cad/requirements.txt
```

## Source layout

```text
cad/s1/
  s1_parameters.scad
  s1_sled.scad
  s1_coupler.scad
  s1_interface_plate.scad
  modules/
  fixtures/
  stl/
```

Shared dimensions live in `s1_parameters.scad`. Treat the defaults as prototype values derived from GitHub Issue #17 and `docs/engineering/s1-vehicle-dynamics-loading-envelope.md`.

## Render and validate

Generate all expected STL files and the asset report:

```bash
python3 tools/cad/s1_generate_and_validate.py
```

The script renders OpenSCAD targets into `cad/s1/stl/`, checks expected files, reports bounding boxes and volume, checks mesh watertightness when `trimesh` is installed, confirms declared envelopes, verifies that full-size parts have split alternatives that fit a 220 x 220 mm bed, and writes STL-derived SVG previews to `cad/s1/previews/`.

The current OpenSCAD split workflow has a known non-manifold edge gap in several clipped front/rear split STLs. The validator does not claim those files are fully watertight. It reports a `CONDITIONAL PASS` when those known split findings are the only mesh issues. See `known-mesh-gaps.md` for why this is not treated as a complete watertight proof and what work is required to reach full `PASS`.

## Print recommendations

- Layer height: 0.16-0.24 mm
- Nozzle: 0.4 mm
- Walls: at least 3 perimeters
- Top/bottom: at least 4 solid layers
- Infill: 20-35% for shells, 40-60% for fixtures and couplers
- Material: PLA or PETG for fit prototypes; use the same material across comparison tests
- Supports: avoid inside attachment sockets; use light supports only under nose/tail taper if needed

These recommendations support dummy-model testing only. Do not infer production strength from printed samples.

## Orientation

- Sled body: print split front/rear halves flat on the deck bottom for common 220 x 220 mm beds.
- Interface plate: print split front/rear halves flat; keep mating faces non-cosmetic.
- Enclosed pods: print split halves flat; keep alignment keys clean and deburred.
- Split alignment keys: print flat and bond across the underside seam after dry fitting the flat split faces.
- Couplers: print flat with the pivot axis vertical; inspect pivot holes after printing.
- CG fixture: print flat on the base.
- Coupler-angle gauge and clearance gauge: print flat.

## Assembly notes

- Dry-fit every split key before adhesive or fastener use.
- Keep split-plane mating faces visible for inspection.
- Bond split halves only after the loose alignment keys align cleanly across the underside seam.
- Do not use any electrical connector as an alignment or retention member.
- Verify four attachment stations seat before adding ballast.
- Coupler parts are sacrificial low-speed dummy parts.

## Tolerance adjustment

Printer fit is controlled primarily by:

- `s1_printer_tolerance`
- `s1_mount_clearance`
- `s1_split_key_length`
- `s1_split_key_width`
- `s1_split_key_height`

Increase tolerance in 0.1 mm steps if module pins, split keys, or coupler joints bind. Re-render all mating parts after changing shared parameters.

## Ballast experiments

The sled and ballast test module include:

- quadrant ballast pockets;
- a longitudinal center ballast channel;
- an elevated ballast mount;
- visible X0/Y0 datum marks;
- sled and module CG marks;
- four-point fixture pads matching the provisional support-node spacing.

Use removable, weighed ballast blocks. Record mass, ballast location, measured support reactions, and observed CG before route-clearance or coupled-curve tests.

## Preview references

- `cad/s1/previews/index.svg`
- `cad/s1/previews/s1_sled_body.svg`
- `cad/s1/previews/s1_interface_plate.svg`
- `cad/s1/previews/s1_coupler_front.svg`
- `cad/s1/previews/s1_coupler_rear.svg`
- `cad/s1/previews/commuter_pod.svg`
- `cad/s1/previews/overnight_pod.svg`
- `cad/s1/previews/battery_pod.svg`
- `cad/s1/previews/container_40_adapter.svg`
- `cad/s1/previews/container_20_twin_adapter.svg`
- `cad/s1/previews/open_bin.svg`
- `cad/s1/previews/ballast_test_module.svg`
- `cad/s1/previews/cg_test_fixture.svg`
- `cad/s1/previews/coupler_angle_gauge.svg`
- `cad/s1/previews/route_clearance_gauge.svg`
- `cad/s1/previews/split_alignment_keys.svg`
- `docs/schematics/s1-sled-interface.svg`
- `docs/schematics/s1-reference-modules.svg`
- `cad/s1/asset-report.md`
- `cad/s1/known-mesh-gaps.md`
