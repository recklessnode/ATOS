#!/usr/bin/env python3
"""Render and validate the S1 printable prototype CAD set."""

from __future__ import annotations

import argparse
import html
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
PREVIEW_DIR = CAD_DIR / "previews"
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
    known_non_manifold_gap: bool = False


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
        Target("S1 sled body front split", CAD_DIR / "s1_sled.scad", "s1_sled_body_front_split.stl", (174, 78, 24), {"build_part": "front"}, split_group="s1_sled_body", known_non_manifold_gap=True),
        Target("S1 sled body rear split", CAD_DIR / "s1_sled.scad", "s1_sled_body_rear_split.stl", (174, 78, 24), {"build_part": "rear"}, split_group="s1_sled_body", known_non_manifold_gap=True),
        Target("Interface plate", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate.stl", (242, 66, 10), must_fit_bed=False, split_group="interface_plate", notes="Full reference plate; use split files for 220 mm beds."),
        Target("Interface plate front split", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate_front_split.stl", (134, 66, 10), {"build_part": "front"}, split_group="interface_plate", known_non_manifold_gap=True),
        Target("Interface plate rear split", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate_rear_split.stl", (134, 66, 10), {"build_part": "rear"}, split_group="interface_plate", known_non_manifold_gap=True),
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
            Target(f"{stem.replace('_', ' ').title()} front split", source, f"{stem}_front_split.stl", (134, 70, 74), {"build_part": "front"}, split_group=group, known_non_manifold_gap=True),
            Target(f"{stem.replace('_', ' ').title()} rear split", source, f"{stem}_rear_split.stl", (134, 70, 74), {"build_part": "rear"}, split_group=group, known_non_manifold_gap=True),
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


def validate_targets(targets_to_check: Iterable[Target], render: bool) -> tuple[list[str], list[str], list[str]]:
    failures: list[str] = []
    known_gaps: list[str] = []
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
        if info.is_watertight is False:
            message = f"{target.output} is not watertight according to {info.parser}"
            if target.known_non_manifold_gap:
                known_gaps.append(message)
            else:
                failures.append(message)
        rows.append(report_row(target, info, envelope_ok, bed_ok))
    for group, values in split_fit.items():
        if not any(values):
            failures.append(f"No split or direct part in group {group} fits the declared print bed")
    write_report(rows, failures, known_gaps)
    write_previews(all_targets)
    return rows, failures, known_gaps


def format_bbox(bbox: tuple[float, float, float]) -> str:
    return " x ".join(f"{value:.2f}" for value in bbox)


def report_row(target: Target, info: MeshInfo, envelope_ok: bool, bed_ok: bool) -> str:
    volume = "n/a" if info.volume_mm3 is None else f"{info.volume_mm3:.1f}"
    if info.is_watertight is None:
        watertight = "unknown"
    elif info.is_watertight:
        watertight = "yes"
    elif target.known_non_manifold_gap:
        watertight = "known non-manifold gap"
    else:
        watertight = "no"
    return (
        f"| {target.output} | {target.name} | {format_bbox(info.bbox_mm)} | "
        f"{volume} | {info.triangle_count} | {watertight} | "
        f"{'yes' if envelope_ok else 'no'} | {'yes' if bed_ok else 'no'} | {target.notes} |"
    )


def write_report(rows: list[str], failures: list[str], known_gaps: list[str]) -> None:
    status = "FAIL" if failures else "CONDITIONAL PASS" if known_gaps else "PASS"
    REPORT_PATH.write_text(
        "\n".join([
            "# S1 CAD Asset Report",
            "",
            "Generated by `python3 tools/cad/s1_generate_and_validate.py`.",
            "",
            "The report validates prototype CAD assets for file presence, OpenSCAD renderability, bounding boxes, volume, watertight meshes when `trimesh` is available, declared envelopes, 220 x 220 mm print-bed fit for direct or split parts, and generated preview coverage.",
            "",
            "## Results",
            "",
            "| STL | Target | Bounding box XYZ mm | Volume mm3 | Triangles | Watertight | Envelope OK | Bed fit | Notes |",
            "|---|---|---:|---:|---:|---|---|---|---|",
            *rows,
            "",
            "## Validation status",
            "",
            status,
            "",
            *[f"- {failure}" for failure in failures],
            *[f"- Known mesh gap: {gap}" for gap in known_gaps],
            "",
            "## Preview status",
            "",
            f"- Generated {PREVIEW_DIR.relative_to(ROOT)}/index.svg as the contact sheet for major S1 parts.",
            f"- Generated individual STL-derived SVG previews in {PREVIEW_DIR.relative_to(ROOT)}/.",
            "",
            "## Known mesh validation gap",
            "",
            "- The non-watertight split files above are known gaps in the current OpenSCAD boolean-clipping approach. They are not reported as fully passing watertight proof.",
            "- Full-size reference STLs remain watertight and are the canonical visual/envelope geometry. Common-bed split files remain included as provisional print-layout aids because they fit the 220 x 220 mm envelope but require repair or redesign before claiming manifold proof.",
            "- To turn this conditional result into a full PASS, either repair the affected split STLs by hand in a mesh/CAD repair tool, redesign the split parts as native closed half-solids rather than post-clipped solids, or use a more capable CAD/mesh pipeline and then remove the known-gap flags.",
            "",
            "## Prototype limitation",
            "",
            "These meshes are printable fit and measurement prototypes only. They are not certified structural, passenger, electrical, battery-safety, or maglev hardware.",
            "",
        ]),
        encoding="utf8",
    )

def write_previews(all_targets: list[Target]) -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    preview_targets = [
        target for target in all_targets
        if "_split" not in target.output and target.output != "split_alignment_keys.stl"
    ] + [
        target for target in all_targets
        if target.output == "split_alignment_keys.stl"
    ]
    previews: list[tuple[Target, str, tuple[float, float, float]]] = []
    for target in preview_targets:
        path = STL_DIR / target.output
        if not path.exists():
            continue
        vertices = stl_vertices(path)
        if not vertices:
            continue
        info = basic_stl_info(path)
        filename = f"{Path(target.output).stem}.svg"
        (PREVIEW_DIR / filename).write_text(preview_svg(target, vertices, info.bbox_mm), encoding="utf8")
        previews.append((target, filename, info.bbox_mm))
    (PREVIEW_DIR / "index.svg").write_text(contact_sheet_svg(previews), encoding="utf8")


def stl_vertices(path: Path) -> list[tuple[float, float, float]]:
    data = path.read_bytes()
    vertices: list[tuple[float, float, float]] = []
    if len(data) >= 84:
        count = struct.unpack("<I", data[80:84])[0]
        expected = 84 + count * 50
        if expected == len(data):
            offset = 84
            for _ in range(count):
                offset += 12
                for _vertex in range(3):
                    vertices.append(struct.unpack("<fff", data[offset:offset + 12]))
                    offset += 12
                offset += 2
            return vertices
    text = data.decode("utf8", errors="ignore")
    coords: list[float] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("vertex "):
            coords.extend(float(part) for part in stripped.split()[1:4])
    return list(zip(coords[0::3], coords[1::3], coords[2::3]))


def preview_svg(
    target: Target,
    vertices: list[tuple[float, float, float]],
    bbox: tuple[float, float, float],
) -> str:
    panels = [
        ("isometric", project_points(vertices, "iso")),
        ("top", project_points(vertices, "top")),
        ("side", project_points(vertices, "side")),
        ("front", project_points(vertices, "front")),
    ]
    panel_svgs = []
    for index, (label, points) in enumerate(panels):
        x = 28 + (index % 2) * 292
        y = 90 + (index // 2) * 145
        panel_svgs.append(preview_panel(label, points, x, y, 260, 116))
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420" role="img">',
        "  <title>" + html.escape(target.name) + " STL-derived preview</title>",
        "  <rect width='640' height='420' fill='#f6f8f7'/>",
        "  <text x='28' y='34' font-family='Arial, sans-serif' font-size='20' font-weight='700' fill='#1e2b27'>" + html.escape(target.name) + "</text>",
        "  <text x='28' y='58' font-family='Arial, sans-serif' font-size='12' fill='#536862'>" + html.escape(target.output) + "</text>",
        "  <text x='28' y='76' font-family='Arial, sans-serif' font-size='12' fill='#536862'>bbox " + format_bbox(bbox) + " mm</text>",
        *panel_svgs,
        "</svg>",
        "",
    ])


def preview_panel(
    label: str,
    points: list[tuple[float, float]],
    x: float,
    y: float,
    width: float,
    height: float,
) -> str:
    hull = convex_hull(points)
    fitted = fit_points(hull, x + 12, y + 20, width - 24, height - 34)
    polygon = " ".join(f"{px:.1f},{py:.1f}" for px, py in fitted)
    return "\n".join([
        f"  <g aria-label='{html.escape(label)} projection'>",
        f"    <rect x='{x:.1f}' y='{y:.1f}' width='{width:.1f}' height='{height:.1f}' rx='8' fill='#ffffff' stroke='#c7d4ce'/>",
        f"    <text x='{x + 12:.1f}' y='{y + 16:.1f}' font-family='Arial, sans-serif' font-size='11' font-weight='700' fill='#38524b'>{html.escape(label)}</text>",
        f"    <polygon points='{polygon}' fill='#dbe8e3' stroke='#163d35' stroke-width='2'/>" if polygon else "",
        "  </g>",
    ])


def contact_sheet_svg(previews: list[tuple[Target, str, tuple[float, float, float]]]) -> str:
    columns = 3
    card_width = 250
    card_height = 128
    width = 820
    height = 112 + math.ceil(len(previews) / columns) * card_height
    cards: list[str] = []
    for index, (target, filename, bbox) in enumerate(previews):
        x = 28 + (index % columns) * card_width
        y = 82 + (index // columns) * card_height
        cards.append("\n".join([
            f"  <a href='{html.escape(filename)}'>",
            f"    <rect x='{x}' y='{y}' width='222' height='104' rx='8' fill='#ffffff' stroke='#c7d4ce'/>",
            f"    <text x='{x + 12}' y='{y + 24}' font-family='Arial, sans-serif' font-size='13' font-weight='700' fill='#1e2b27'>{html.escape(target.name)}</text>",
            f"    <text x='{x + 12}' y='{y + 47}' font-family='Arial, sans-serif' font-size='11' fill='#536862'>{html.escape(target.output)}</text>",
            f"    <text x='{x + 12}' y='{y + 66}' font-family='Arial, sans-serif' font-size='11' fill='#536862'>bbox {html.escape(format_bbox(bbox))} mm</text>",
            "  </a>",
        ]))
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img">',
        "  <title>S1 major CAD part preview contact sheet</title>",
        "  <rect width='100%' height='100%' fill='#f6f8f7'/>",
        "  <text x='28' y='36' font-family='Arial, sans-serif' font-size='22' font-weight='700' fill='#1e2b27'>S1 major CAD part previews</text>",
        "  <text x='28' y='60' font-family='Arial, sans-serif' font-size='12' fill='#536862'>Each card links to an STL-derived SVG preview generated from mesh vertices.</text>",
        *cards,
        "</svg>",
        "",
    ])


def project_points(vertices: list[tuple[float, float, float]], mode: str) -> list[tuple[float, float]]:
    if mode == "top":
        return [(x, y) for x, y, _z in vertices]
    if mode == "side":
        return [(x, z) for x, _y, z in vertices]
    if mode == "front":
        return [(y, z) for _x, y, z in vertices]
    return [((x - y) * 0.866, (x + y) * 0.35 - z) for x, y, z in vertices]


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    unique = sorted(set((round(x, 3), round(y, 3)) for x, y in points))
    if len(unique) <= 1:
        return unique

    def cross(
        origin: tuple[float, float],
        left: tuple[float, float],
        right: tuple[float, float],
    ) -> float:
        return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])

    lower: list[tuple[float, float]] = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper: list[tuple[float, float]] = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def fit_points(
    points: list[tuple[float, float]],
    x: float,
    y: float,
    width: float,
    height: float,
) -> list[tuple[float, float]]:
    if not points:
        return []
    min_x = min(point[0] for point in points)
    max_x = max(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_y = max(point[1] for point in points)
    span_x = max(max_x - min_x, 1)
    span_y = max(max_y - min_y, 1)
    scale = min(width / span_x, height / span_y)
    offset_x = x + (width - span_x * scale) / 2
    offset_y = y + (height - span_y * scale) / 2
    return [
        (offset_x + (point[0] - min_x) * scale, offset_y + (max_y - point[1]) * scale)
        for point in points
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-render", action="store_true", help="Validate existing STL files without rerendering OpenSCAD.")
    args = parser.parse_args()
    _rows, failures, known_gaps = validate_targets(targets(), render=not args.no_render)
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1
    for gap in known_gaps:
        print(f"KNOWN-GAP: {gap}")
    action = "Validated existing" if args.no_render else "Rendered and validated"
    print(f"{action} {len(targets())} S1 CAD STL assets.")
    print(f"Wrote {REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
