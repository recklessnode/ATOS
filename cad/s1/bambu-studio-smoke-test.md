# Bambu Studio Import And Slice Smoke Test

The generated S1 `.3mf` archives are generic 3MF model plates. They are not native Bambu Studio project files and do not claim to carry printer profiles, filament profiles, process profiles, or slicer settings that Bambu Studio will automatically apply.

Use this reproducible smoke test for each representative plate before treating the 3MF as printer-ready:

1. Open Bambu Studio.
2. Select an H2C printer profile matching the intended nozzle mode.
3. Import the S1 3MF archive as a model plate.
4. Confirm the model units are millimeters and every object remains at 100% scale.
5. Confirm every object lies inside the selected H2C usable area: 300 x 320 mm for dual-nozzle, or 305 x 320 mm for single-nozzle.
6. Manually apply the ATOS recommendations from `Metadata/atos-print-settings.json`.
7. Slice the plate.
8. Record the Bambu Studio version, operating system, printer profile, nozzle mode, 3MF filename, and any unit, placement, geometry, or slicing warnings.

Passing validation in `tools/cad/s1_generate_and_validate.py` proves the archive is a readable generic 3MF with millimeter units, expected objects, 100% geometry scale, selected H2C plate fit, ATOS metadata, and this smoke-test procedure. It does not prove that Bambu Studio applied print settings automatically.
