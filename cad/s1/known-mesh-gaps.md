# S1 Mesh Validation Gap History

The S1 printable kit currently has no active known mesh-gap waiver. The generated `cad/s1/asset-report.md` must report `PASS`, and every STL must report watertight when validated with the dependencies in `tools/cad/requirements.txt`.

## Resolved Split-STL Gap

An earlier OpenSCAD split workflow produced several common-bed front/rear split STLs with duplicate split-plane faces. `trimesh` reported those clipped exports as non-manifold even though the corresponding full reference parts were watertight.

The current workflow keeps the OpenSCAD source for the provisional parts, then normalizes split STL exports through `manifold3d` before validation. The validator fails by default if any STL lacks watertight proof. The `--allow-known-gaps` flag is reserved for diagnostic investigations and must not be used for acceptance validation.

## Future Gap Policy

If a future CAD change reintroduces a non-watertight STL, do not hide it as a passing asset. Either:

- repair or regenerate the STL so validation returns full `PASS`;
- redesign the affected part as a native closed solid instead of clipping a completed solid;
- document a temporary diagnostic gap, require `--allow-known-gaps` for that diagnostic run, and keep the PR in draft until acceptance validation passes without the flag.

Known-gap documentation can explain missing LLM effort, a geometry-tooling limitation, or a need for manual CAD repair, but it does not satisfy the printable-kit acceptance contract by itself.
