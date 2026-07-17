# S1 Known Mesh Validation Gaps

The current S1 printable kit has a known mesh-validation gap in several common-bed split STL files. `trimesh` reports those split files as non-watertight after OpenSCAD boolean clipping. The validator records those findings as known gaps rather than claiming full watertight proof.

## Why This Happens

The full reference parts are generated as closed solids and validate as watertight. The common-bed split files are produced by clipping those solids into front/rear halves so they fit a 220 x 220 mm printer bed. That split operation can leave non-manifold edges along the cut surface in the exported STL, even when the opposite half and the full reference part remain simple solids.

This is not a physics or envelope problem. It is a mesh-production limitation in the current OpenSCAD split workflow.

## Current Acceptance Position

The split files remain in the draft PR because they are useful prototype print-layout aids and they satisfy file presence, renderability, envelope, and bed-fit checks. They are not treated as proven watertight manufacturing assets.

This gap should not be hidden as a full PASS. The generated `cad/s1/asset-report.md` reports `CONDITIONAL PASS` when only these known split mesh gaps are present.

## What Is Needed For Full PASS

Any one of these paths should be sufficient:

- Repair the affected split STLs by hand in a slicer or mesh-repair tool, commit the repaired assets, and rerun validation with no known-gap flags.
- Redesign the split CAD as native closed front/rear half-solids rather than clipping completed solids.
- Move the split-generation workflow to a CAD/mesh toolchain that guarantees manifold output for split solids.
- Use additional LLM/CAD effort, potentially with a stronger geometry-capable model, to refactor the OpenSCAD split logic into manifold half-part construction.

After that, remove the known-gap flags from `tools/cad/s1_generate_and_validate.py`, rerun:

```bash
python3 tools/cad/s1_generate_and_validate.py
python3 tools/cad/s1_generate_and_validate.py --no-render
```

and require every split STL to report watertight before changing the report status from `CONDITIONAL PASS` to `PASS`.
