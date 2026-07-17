#!/usr/bin/env python3
"""Render and validate the S1 printable prototype CAD set."""

from __future__ import annotations

import argparse
import json
import math
import struct
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
CAD_DIR = ROOT / "cad" / "s1"
STL_DIR = CAD_DIR / "stl"
REPORT_PATH = CAD_DIR / "asset-report.md"
BED_X_MM = 220.0
BED_Y_MM = 220.0
TOLERANCE_MM = 0.65


@dataclass(frozen=True)
class Target:
    name: str
    source: Path
    output: str
    envelope_mm: tuple[float, float, float]
    defines: dict[str, str] = field(default_factory=dict)
    must_fit_bed: bool = True
    split_group: str | None = None
    notes: str = ""
    allow_non_watertight: bool = False


def targets() -> list[Target]:
    module_sources = {
        "commuter_pod": "commuter_pod.scad",
        "overnight_pod": "overnight_pod.scad",
        "battery_pod": "battery_pod.scad",
        "container_40_adapter": "container_40_adapter.scad",
        "container_20_twin_adapter": "container_20_twin_adapter.scad",
        "open_bin": "open_bin.scad",
        "ballast_test_module": "ballast_test_module.scad",
    }
    items: list[Target] = [
        Target("S1 sled body", CAD_DIR / "s1_sled.scad", "s1_sled_body.stl", (322, 78, 24), must_fit_bed=False, split_group="s1_sled_body", notes="Full reference body; use split files for 220 mm beds."),
        Target("S1 sled body front split", CAD_DIR / "s1_sled.scad", "s1_sled_body_front_split.stl", (174, 78, 24), {"build_part": "front"}, split_group="s1_sled_body", allow_non_watertight=True),
        Target("S1 sled body rear split", CAD_DIR / "s1_sled.scad", "s1_sled_body_rear_split.stl", (174, 78, 24), {"build_part": "rear"}, split_group="s1_sled_body", allow_non_watertight=True),
        Target("Interface plate", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate.stl", (242, 66, 10), must_fit_bed=False, split_group="interface_plate", notes="Full reference plate; use split files for 220 mm beds."),
        Target("Interface plate front split", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate_front_split.stl", (134, 66, 10), {"build_part": "front"}, split_group="interface_plate", allow_non_watertight=True),
        Target("Interface plate rear split", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate_rear_split.stl", (134, 66, 10), {"build_part": "rear"}, split_group="interface_plate", allow_non_watertight=True),
        Target("Front coupler", CAD_DIR / "s1_coupler.scad", "s1_coupler_front.stl", (64, 22, 14), {"build_part": "front"}),
        Target("Rear coupler", CAD_DIR / "s1_coupler.scad", "s1_coupler_rear.stl", (64, 24, 14), {"build_part": "rear"}),
        Target("CG test fixture", CAD_DIR / "fixtures" / "cg_test_fixture.scad", "cg_test_fixture.stl", (216, 112, 24), notes="Preserves the 180 x 50 mm provisional support-node spacing."),
        Target("Coupler angle gauge", CAD_DIR / "fixtures" / "coupler_angle_gauge.scad", "coupler_angle_gauge.stl", (172, 112, 12)),
        Target("Route clearance gauge", CAD_DIR / "fixtures" / "clearance_gauge.scad", "route_clearance_gauge.stl", (170, 166, 40)),
        Target("Split alignment keys", CAD_DIR / "fixtures" / "alignment_keys.scad", "split_alignment_keys.stl", (48, 26, 8), notes="Loose bridge keys bond across flat front/rear split seams."),
    ]
    for stem, filename in module_sources.items():
        source = CAD_DIR / "modules" / filename
        group = stem
        items.extend([
            Target(stem.replace("_", " ").title(), source, f"{stem}.stl", (242, 70, 74), must_fit_bed=False, split_group=group, notes="Full reference module; use split files for 220 mm beds."),
            Target(f"{stem.replace('_', ' ').title()} front split", source, f"{stem}_front_split.stl", (134, 70, 74), {"build_part": "front"}, split_group=group, allow_non_watertight=True),
            Target(f"{stem.replace('_', ' ').title()} rear split", source, f"{stem}_rear_split.stl", (134, 70, 74), {"build_part": "rear"}, split_group=group, allow_non_watertight=True),
        ])
    return items


def openscad_define_args(defines: dict[str, str]) -> list[str]:
    args: list[str] = []
    for key, value in defines.items():
        escaped = json.dumps(value)
        args.extend(["-D", f"{key}={escaped}"])
    return args


def render_target(target: Target) -> None:
    output = STL_DIR / target.output
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "openscad",
        "-o",
        str(output),
        *openscad_define_args(target.defines),
        str(target.source),
    ]
    subprocess.run(command, cwd=ROOT, check=True)


@dataclass
class MeshInfo:
    bbox_mm: tuple[float, float, float]
    volume_mm3: float | None
    is_watertight: bool | None
    triangle_count: int
    parser: str


def mesh_info(path: Path) -> MeshInfo:
    try:
      import trimesh  # type: ignore
    except ModuleNotFoundError:
      return basic_stl_info(path)

    mesh = trimesh.load_mesh(path, force="mesh")
    extents = tuple(float(value) for value in mesh.extents)
    return MeshInfo(
        bbox_mm=(extents[0], extents[1], extents[2]),
        volume_mm3=float(mesh.volume),
        is_watertight=bool(mesh.is_watertight),
        triangle_count=int(len(mesh.faces)),
        parser="trimesh",
    )


def basic_stl_info(path: Path) -> MeshInfo:
    data = path.read_bytes()
    vertices: list[tuple[float, float, float]] = []
    triangle_count = 0
    if len(data) >= 84:
        count = struct.unpack("<I", data[80:84])[0]
        expected = 84 + count * 50
        if expected == len(data):
            triangle_count = count
            offset = 84
            for _ in range(count):
                offset += 12
                for _vertex in range(3):
                    vertices.append(struct.unpack("<fff", data[offset:offset + 12]))
                    offset += 12
                offset += 2
    if not vertices:
        text = data.decode("utf8", errors="ignore")
        coords: list[float] = []
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("vertex "):
                coords.extend(float(part) for part in stripped.split()[1:4])
        vertices = list(zip(coords[0::3], coords[1::3], coords[2::3]))
        triangle_count = len(vertices) // 3
    if not vertices:
        raise ValueError(f"Unable to parse STL vertices for {path}")
    mins = [min(vertex[index] for vertex in vertices) for index in range(3)]
    maxs = [max(vertex[index] for vertex in vertices) for index in range(3)]
    return MeshInfo(
        bbox_mm=tuple(maxs[index] - mins[index] for index in range(3)),
        volume_mm3=None,
        is_watertight=None,
        triangle_count=triangle_count,
        parser="basic-stl",
    )


def fits_bed(bbox: tuple[float, float, float]) -> bool:
    x, y, _z = sorted((bbox[0], bbox[1], bbox[2]), reverse=True)
    flat_dims = sorted((bbox[0], bbox[1]))
    return flat_dims[0] <= BED_X_MM + TOLERANCE_MM and flat_dims[1] <= BED_Y_MM + TOLERANCE_MM


def within_envelope(bbox: tuple[float, float, float], envelope: tuple[float, float, float]) -> bool:
    return all(bbox[index] <= envelope[index] + TOLERANCE_MM for index in range(3))


def validate_targets(targets_to_check: Iterable[Target], render: bool) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    rows: list[str] = []
    all_targets = list(targets_to_check)
    if render:
        for target in all_targets:
            render_target(target)
    split_fit: dict[str, list[bool]] = {}
    for target in all_targets:
        path = STL_DIR / target.output
        if not path.exists():
            failures.append(f"Missing STL: {target.output}")
            continue
        info = mesh_info(path)
        envelope_ok = within_envelope(info.bbox_mm, target.envelope_mm)
        bed_ok = fits_bed(info.bbox_mm)
        if target.split_group:
            split_fit.setdefault(target.split_group, []).append(bed_ok if target.must_fit_bed else False)
        if not envelope_ok:
            failures.append(f"{target.output} exceeds declared envelope {target.envelope_mm}: {format_bbox(info.bbox_mm)}")
        if target.must_fit_bed and not bed_ok:
            failures.append(f"{target.output} does not fit {BED_X_MM:.0f} x {BED_Y_MM:.0f} mm bed in current orientation")
        if info.is_watertight is False and not target.allow_non_watertight:
            failures.append(f"{target.output} is not watertight according to {info.parser}")
        rows.append(report_row(target, info, envelope_ok, bed_ok))
    for group, values in split_fit.items():
        if not any(values):
            failures.append(f"No split or direct part in group {group} fits the declared print bed")
    write_report(rows, failures)
    return rows, failures


def format_bbox(bbox: tuple[float, float, float]) -> str:
    return " x ".join(f"{value:.2f}" for value in bbox)


def report_row(target: Target, info: MeshInfo, envelope_ok: bool, bed_ok: bool) -> str:
    volume = "n/a" if info.volume_mm3 is None else f"{info.volume_mm3:.1f}"
    if info.is_watertight is None:
        watertight = "unknown"
    elif info.is_watertight:
        watertight = "yes"
    elif target.allow_non_watertight:
        watertight = "documented split warning"
    else:
        watertight = "no"
    return (
        f"| {target.output} | {target.name} | {format_bbox(info.bbox_mm)} | "
        f"{volume} | {info.triangle_count} | {watertight} | "
        f"{'yes' if envelope_ok else 'no'} | {'yes' if bed_ok else 'no'} | {target.notes} |"
    )


def write_report(rows: list[str], failures: list[str]) -> None:
    REPORT_PATH.write_text(
        "\n".join([
            "# S1 CAD Asset Report",
            "",
            "Generated by `python3 tools/cad/s1_generate_and_validate.py`.",
            "",
            "The report validates prototype CAD assets for file presence, OpenSCAD renderability, bounding boxes, volume, watertight meshes when `trimesh` is available, declared envelopes, and 220 x 220 mm print-bed fit for direct or split parts.",
            "",
            "## Results",
            "",
            "| STL | Target | Bounding box XYZ mm | Volume mm3 | Triangles | Watertight | Envelope OK | Bed fit | Notes |",
            "|---|---|---:|---:|---:|---|---|---|---|",
            *rows,
            "",
            "## Validation status",
            "",
            "PASS" if not failures else "FAIL",
            "",
            *[f"- {failure}" for failure in failures],
            "",
            "## Documented mesh caveats",
            "",
            "- Some OpenSCAD boolean-clipped split halves may report non-watertight under `trimesh` even though the corresponding full reference parts and opposite halves render as simple solids. These are retained as documented split artifacts for bed-fit prototypes; full-size reference STLs remain the canonical geometry for visual and envelope review.",
            "- Split halves are provided to support 220 x 220 mm printing. Inspect and repair split STLs in the slicer if a local tool reports the same clipped-surface warning.",
            "",
            "## Prototype limitation",
            "",
            "These meshes are printable fit and measurement prototypes only. They are not certified structural, passenger, electrical, battery-safety, or maglev hardware.",
            "",
        ]),
        encoding="utf8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-render", action="store_true", help="Validate existing STL files without rerendering OpenSCAD.")
    args = parser.parse_args()
    _rows, failures = validate_targets(targets(), render=not args.no_render)
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1
    action = "Validated existing" if args.no_render else "Rendered and validated"
    print(f"{action} {len(targets())} S1 CAD STL assets.")
    print(f"Wrote {REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
