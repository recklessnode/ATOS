# S1 Printable Prototype Kit

This directory contains parametric OpenSCAD source and generated STL files for the provisional S1 modular sled prototype kit.

The parts are fit, appearance, packaging, route-clearance, and center-of-mass experiment models. They are not certified passenger-carrying, structural, electrical, battery-safety, or maglev hardware.

Issue #21 recalibrates the S1 family around the full-size dimensional basis documented in `docs/engineering/s1-1-87-dimensional-basis.md`. HO remains the baseline world-scale profile, but the CAD source can regenerate the same full-size design at N, HO, O, or a validated custom model scale. The 40-foot and twin-20 container adapters are printed cradles for actual store-bought containers at the selected model scale, not printed container bodies.

## Required software

- OpenSCAD 2021.01 or newer
- Python 3.11 or newer
- Python mesh tooling from `tools/cad/requirements.txt` for split-STL repair, manifold validation, volume checks, and bounding-box validation

Install the validation dependencies with:

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
  3mf/
  previews/
  generated/
    ho-1-87/
    o-1-48/
```

Shared full-size reference dimensions live in `s1_parameters.scad` and are divided by `s1_scale_ratio`. Manufacturing parameters such as wall thickness, pin diameters, split keys, clearances, and tolerance allowances stay in model millimeters and are not blindly scaled. Treat the defaults as prototype values derived from GitHub Issue #21, `docs/engineering/s1-1-87-dimensional-basis.md`, and `docs/engineering/s1-vehicle-dynamics-loading-envelope.md`.

## Render and validate

Generate all expected STL files and the asset report:

```bash
python3 tools/cad/s1_generate_and_validate.py
```

The default command preserves the legacy root HO output paths under `cad/s1/stl/`, `cad/s1/previews/`, `cad/s1/3mf/`, and `cad/s1/asset-report.md`.

Generate the committed scale-specific HO and O asset sets:

```bash
python3 tools/cad/s1_generate_and_validate.py --profiles ho,o --h2c-nozzle-mode dual
```

Generate or validate a single named profile:

```bash
python3 tools/cad/s1_generate_and_validate.py --profile n --generated-output
python3 tools/cad/s1_generate_and_validate.py --profile o --generated-output
```

Generate a custom ratio:

```bash
python3 tools/cad/s1_generate_and_validate.py --custom-scale 64 --custom-name custom-1-64
```

Acceptance-check N and custom profiles without committing their generated assets:

```bash
python3 tools/cad/s1_generate_and_validate.py --profile n --generated-output --generated-root /tmp/atos-s1-generated --h2c-nozzle-mode dual
python3 tools/cad/s1_generate_and_validate.py --custom-scale 64 --custom-name custom-1-64 --generated-root /tmp/atos-s1-generated --h2c-nozzle-mode dual
```

The script renders OpenSCAD targets into the selected output directory, repairs split-STL duplicate-face artifacts through `manifold3d`, checks expected files, reports bounding boxes and volume, checks mesh watertightness, confirms declared profile envelopes, validates 20-foot and 40-foot container pocket dimensions for the selected scale, validates the assembled over-coupler-face reference length, verifies selected primary-bed fit, validates H2C-oriented fit against the selected asymmetric H2C usable area with deterministic 90-degree rotation where required, validates the common module interface helpers, writes STL-derived SVG previews, writes an `asset-manifest.json`, and writes generic importable 3MF model plates with ATOS print metadata.

Named profiles:

| Profile | Ratio | Primary bed target | Checked-in generated assets |
|---|---:|---|---|
| `n` | 1:160 | 220 x 220 mm | supported by command, not committed in this PR |
| `ho` | 1:87.1 | 220 x 220 mm | `cad/s1/generated/ho-1-87/` |
| `o` | 1:48 | H2C dual-nozzle 300 x 320 mm usable area by default | `cad/s1/generated/o-1-48/` |

O-scale complete-car 3MFs are emitted as paired sled/module plate files when the complete car cannot fit on one H2C plate. Oversized profile fixtures remain available as validated STL assets even when no H2C 3MF plate is generated for that fixture.

The H2C validator supports `--h2c-nozzle-mode dual` for 300 x 320 mm and `--h2c-nozzle-mode single` for 305 x 320 mm. Generated acceptance assets in this PR use the stricter dual-nozzle usable area.

The 3MF archives are generic model plates, not native Bambu Studio project files. They include `Metadata/atos-print-settings.json` and an embedded `Metadata/bambu-studio-smoke-test.md`; Bambu Studio printer, filament, and process settings must be applied manually and verified by the smoke test in `bambu-studio-smoke-test.md`.

Acceptance validation now requires every generated STL, including every common-bed split STL, to provide watertight proof. Diagnostic known-gap handling remains available in the validator for future investigations, but no active known-gap waiver is used for the current asset report. See `known-mesh-gaps.md` for the resolved mesh-gap history and expectations for future CAD changes.

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

- HO sled body: print split front/rear halves flat on the deck bottom for common 220 x 220 mm beds.
- Sled body on H2C-sized plates: the recalibrated 300 mm body fits one-piece inside the H2C dual-nozzle 300 x 320 mm usable area.
- O sled body: use generated split front/rear H2C assets; the full O body STL is an assembly/reference asset.
- Interface plate and modules: print one-piece when the selected profile fits the target bed; otherwise use the generated split front/rear assets.
- Split alignment keys: print flat and bond across the underside seam after dry fitting the flat split faces and underside receiver sockets.
- Couplers: print flat with the pivot axis vertical; inspect pivot holes after printing.
- CG fixture: print flat on the base.
- Coupler-angle gauge and clearance gauge: print flat.
- Container adapters: dry-fit the purchased 40-foot or 20-foot containers for the selected model scale in the printed pockets before adding ballast, scenery, or adhesive.

## Assembly notes

- Dry-fit every split key before adhesive or fastener use.
- Keep split-plane mating faces visible for inspection.
- Bond split halves only after the loose alignment keys seat cleanly in the underside receiver sockets across the seam.
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
- `cad/s1/previews/s1_coupler_face_length_reference.svg`
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
- `cad/s1/3mf/`
- `cad/s1/bambu-studio-smoke-test.md`
- `cad/s1/generated/ho-1-87/asset-report.md`
- `cad/s1/generated/o-1-48/asset-report.md`
- `docs/schematics/s1-sled-interface.svg`
- `docs/schematics/s1-reference-modules.svg`
- `cad/s1/asset-report.md`
- `cad/s1/known-mesh-gaps.md`
