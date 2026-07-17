#!/usr/bin/env python3
"""Render and validate the S1 printable prototype CAD set."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import struct
import subprocess
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
CAD_DIR = ROOT / "cad" / "s1"
STL_DIR = CAD_DIR / "stl"
REPORT_PATH = CAD_DIR / "asset-report.md"
PREVIEW_DIR = CAD_DIR / "previews"
THREE_MF_DIR = CAD_DIR / "3mf"
BED_X_MM = 220.0
BED_Y_MM = 220.0
H2C_BED_X_MM = 320.0
H2C_BED_Y_MM = 320.0
H2C_MARGIN_MM = 5.0
TOLERANCE_MM = 0.65
SCALE_RATIO = 87.1


@dataclass(frozen=True)
class Target:
    name: str
    source: Path
    output: str
    envelope_mm: tuple[float, float, float]
    defines: dict[str, str] = field(default_factory=dict)
    must_fit_bed: bool = True
    must_fit_h2c: bool = True
    split_group: str | None = None
    notes: str = ""


@dataclass(frozen=True)
class PrintPart:
    output: str
    name: str


@dataclass(frozen=True)
class PrintProject:
    filename: str
    title: str
    parts: tuple[PrintPart, ...]
    notes: str


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
    module_envelopes = {
        "commuter_pod": (182, 42, 40),
        "overnight_pod": (182, 42, 46),
        "battery_pod": (182, 42, 38),
        "container_40_adapter": (182, 42, 12),
        "container_20_twin_adapter": (182, 42, 12),
        "open_bin": (182, 42, 38),
        "ballast_test_module": (182, 42, 62),
    }
    items: list[Target] = [
        Target("S1 sled body", CAD_DIR / "s1_sled.scad", "s1_sled_body.stl", (302, 50, 18), must_fit_bed=False, split_group="s1_sled_body", notes="300 mm printed sled body; length over coupler faces is validated as an assembly dimension."),
        Target("S1 sled body front split", CAD_DIR / "s1_sled.scad", "s1_sled_body_front_split.stl", (152, 50, 18), {"build_part": "front"}, split_group="s1_sled_body"),
        Target("S1 sled body rear split", CAD_DIR / "s1_sled.scad", "s1_sled_body_rear_split.stl", (152, 50, 18), {"build_part": "rear"}, split_group="s1_sled_body"),
        Target("Interface plate", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate.stl", (182, 42, 9), split_group="interface_plate", notes="Full interface plate now fits a 220 mm common bed."),
        Target("Interface plate front split", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate_front_split.stl", (92, 42, 9), {"build_part": "front"}, split_group="interface_plate"),
        Target("Interface plate rear split", CAD_DIR / "s1_interface_plate.scad", "s1_interface_plate_rear_split.stl", (92, 42, 9), {"build_part": "rear"}, split_group="interface_plate"),
        Target("Front coupler", CAD_DIR / "s1_coupler.scad", "s1_coupler_front.stl", (46, 16, 11), {"build_part": "front"}),
        Target("Rear coupler", CAD_DIR / "s1_coupler.scad", "s1_coupler_rear.stl", (46, 18, 11), {"build_part": "rear"}),
        Target("CG test fixture", CAD_DIR / "fixtures" / "cg_test_fixture.scad", "cg_test_fixture.stl", (212, 86, 24), notes="Preserves the recalibrated support-node spacing."),
        Target("Coupler angle gauge", CAD_DIR / "fixtures" / "coupler_angle_gauge.scad", "coupler_angle_gauge.stl", (172, 112, 12)),
        Target("Route clearance gauge", CAD_DIR / "fixtures" / "clearance_gauge.scad", "route_clearance_gauge.stl", (132, 106, 72)),
        Target("Split alignment keys", CAD_DIR / "fixtures" / "alignment_keys.scad", "split_alignment_keys.stl", (48, 26, 8), notes="Loose bridge keys bond across flat front/rear split seams."),
    ]
    for stem, filename in module_sources.items():
        source = CAD_DIR / "modules" / filename
        group = stem
        envelope = module_envelopes[stem]
        split_envelope = (92, envelope[1], envelope[2])
        items.extend([
            Target(stem.replace("_", " ").title(), source, f"{stem}.stl", envelope, split_group=group, notes="Full recalibrated module fits a 220 mm common bed; split variants remain available for experiments."),
            Target(f"{stem.replace('_', ' ').title()} front split", source, f"{stem}_front_split.stl", split_envelope, {"build_part": "front"}, split_group=group),
            Target(f"{stem.replace('_', ' ').title()} rear split", source, f"{stem}_rear_split.stl", split_envelope, {"build_part": "rear"}, split_group=group),
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
    if is_split_stl(target.output):
        repair_split_stl(output)


def is_split_stl(output: str) -> bool:
    return output.endswith("_split.stl")


def repair_split_stl(path: Path) -> None:
    try:
        import manifold3d  # type: ignore
        import numpy as np  # type: ignore
        import trimesh  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Rendered split STL repair requires tools/cad/requirements.txt "
            "dependencies, including trimesh and manifold3d."
        ) from exc

    mesh = trimesh.load_mesh(path, force="mesh")
    manifold_mesh = manifold3d.Mesh(
        np.asarray(mesh.vertices, dtype=np.float32),
        np.asarray(mesh.faces, dtype=np.uint32),
    )
    manifold = manifold3d.Manifold(manifold_mesh)
    if manifold.status() != manifold3d.Error.NoError or manifold.is_empty():
        raise RuntimeError(f"manifold3d could not construct a solid from {path.name}: {manifold.status()}")

    repaired_mesh = manifold.to_mesh()
    repaired = trimesh.Trimesh(
        vertices=np.asarray(repaired_mesh.vert_properties, dtype=np.float64)[:, :3],
        faces=np.asarray(repaired_mesh.tri_verts, dtype=np.int64),
        process=False,
    )
    if not repaired.is_watertight:
        raise RuntimeError(f"manifold3d repair did not produce a watertight split STL for {path.name}")
    repaired.export(path)


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
    flat_dims = sorted((bbox[0], bbox[1]))
    return flat_dims[0] <= BED_X_MM + TOLERANCE_MM and flat_dims[1] <= BED_Y_MM + TOLERANCE_MM


def fits_h2c(bbox: tuple[float, float, float]) -> bool:
    flat_dims = sorted((bbox[0], bbox[1]))
    usable_x = H2C_BED_X_MM - 2 * H2C_MARGIN_MM
    usable_y = H2C_BED_Y_MM - 2 * H2C_MARGIN_MM
    return flat_dims[0] <= usable_x + TOLERANCE_MM and flat_dims[1] <= usable_y + TOLERANCE_MM


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
        write_3mf_projects(print_projects())
    split_fit: dict[str, list[bool]] = {}
    mesh_infos: dict[str, MeshInfo] = {}
    for target in all_targets:
        path = STL_DIR / target.output
        if not path.exists():
            failures.append(f"Missing STL: {target.output}")
            continue
        info = mesh_info(path)
        mesh_infos[target.output] = info
        envelope_ok = within_envelope(info.bbox_mm, target.envelope_mm)
        bed_ok = fits_bed(info.bbox_mm)
        h2c_ok = fits_h2c(info.bbox_mm)
        if target.split_group:
            split_fit.setdefault(target.split_group, []).append(bed_ok if target.must_fit_bed else False)
        if not envelope_ok:
            failures.append(f"{target.output} exceeds declared envelope {target.envelope_mm}: {format_bbox(info.bbox_mm)}")
        if target.must_fit_bed and not bed_ok:
            failures.append(f"{target.output} does not fit {BED_X_MM:.0f} x {BED_Y_MM:.0f} mm bed in current orientation")
        if target.must_fit_h2c and not h2c_ok:
            failures.append(f"{target.output} does not fit H2C usable {H2C_BED_X_MM - 2 * H2C_MARGIN_MM:.0f} x {H2C_BED_Y_MM - 2 * H2C_MARGIN_MM:.0f} mm bed area")
        if info.is_watertight is None:
            failures.append(f"{target.output} could not be checked for watertightness because {info.parser} does not provide topology proof")
        elif info.is_watertight is False:
            message = f"{target.output} is not watertight according to {info.parser}"
            if known_gap_allowed_for(target.output):
                known_gaps.append(message)
            else:
                failures.append(message)
        rows.append(report_row(target, info, envelope_ok, bed_ok, h2c_ok))
    for group, values in split_fit.items():
        if not any(values):
            failures.append(f"No split or direct part in group {group} fits the declared print bed")
    basis_rows, basis_failures = validate_dimensional_basis()
    container_rows, container_failures = validate_container_references()
    split_rows, split_failures = validate_split_external_dimensions(all_targets, mesh_infos)
    h2c_rows, h2c_failures = validate_h2c_fit(all_targets, mesh_infos)
    project_rows, project_failures = validate_3mf_projects(print_projects(), mesh_infos)
    interface_rows, interface_failures = validate_module_interface_fit()
    failures.extend(basis_failures)
    failures.extend(container_failures)
    failures.extend(split_failures)
    failures.extend(h2c_failures)
    failures.extend(project_failures)
    failures.extend(interface_failures)
    write_report(rows, failures, known_gaps, basis_rows, container_rows, split_rows, h2c_rows, project_rows, interface_rows)
    write_previews(all_targets)
    return rows, failures, known_gaps


def known_gap_allowed_for(_output: str) -> bool:
    return False


def format_bbox(bbox: tuple[float, float, float]) -> str:
    return " x ".join(f"{value:.2f}" for value in bbox)


def report_row(target: Target, info: MeshInfo, envelope_ok: bool, bed_ok: bool, h2c_ok: bool) -> str:
    volume = "n/a" if info.volume_mm3 is None else f"{info.volume_mm3:.1f}"
    if info.is_watertight is None:
        watertight = "unknown"
    elif info.is_watertight:
        watertight = "yes"
    else:
        watertight = "no"
    return (
        f"| {target.output} | {target.name} | {format_bbox(info.bbox_mm)} | "
        f"{volume} | {info.triangle_count} | {watertight} | "
        f"{'yes' if envelope_ok else 'no'} | {'yes' if bed_ok else 'no'} | "
        f"{'yes' if h2c_ok else 'no'} | {target.notes} |"
    )


def validate_module_interface_fit() -> tuple[list[str], list[str]]:
    parameters_path = CAD_DIR / "s1_parameters.scad"
    parameters_text = parameters_path.read_text(encoding="utf8")
    parameters = read_scad_numeric_parameters()
    mount_x = parameters.get("s1_mount_x", 0)
    mount_y = parameters.get("s1_mount_y", 0)
    expectations = [
        ("s1_interface_plate.scad", CAD_DIR / "s1_interface_plate.scad", "module_interface_cutouts("),
        *[
            (path.name, path, "module_interface_base(")
            for path in sorted((CAD_DIR / "modules").glob("*.scad"))
        ],
    ]
    rows: list[str] = []
    failures: list[str] = []
    for label, path, helper in expectations:
        text = path.read_text(encoding="utf8")
        ok = helper in text
        if not ok:
            failures.append(f"{label} does not use shared S1 interface helper {helper}")
        rows.append(
            f"| {label} | {helper.rstrip('(')} | {'yes' if ok else 'no'} | "
            f"four mount/latch stations at X +/-{mount_x:g} mm and Y +/-{mount_y:g} mm |"
        )
    helper_checks = [
        ("s1_parameters.scad", "module_interface_cutouts", module_contains_call(parameters_text, "module_interface_cutouts", "mount_pin_holes(") and module_contains_call(parameters_text, "module_interface_cutouts", "latch_slots("), "shared helper includes mount-pin holes and latch slots"),
        ("s1_parameters.scad", "module_interface_base", module_contains_call(parameters_text, "module_interface_base", "module_interface_cutouts("), "shared module base subtracts common interface cutouts"),
    ]
    for label, helper, ok, geometry in helper_checks:
        if not ok:
            failures.append(f"{label} helper {helper} does not preserve shared S1 interface geometry")
        rows.append(f"| {label} | {helper} | {'yes' if ok else 'no'} | {geometry} |")
    return rows, failures


def module_contains_call(text: str, module_name: str, call: str) -> bool:
    start = text.find(f"module {module_name}")
    if start == -1:
        return False
    next_module = text.find("\nmodule ", start + 1)
    body = text[start:] if next_module == -1 else text[start:next_module]
    return call in body


def read_scad_numeric_parameters() -> dict[str, float]:
    text = (CAD_DIR / "s1_parameters.scad").read_text(encoding="utf8")
    values: dict[str, float] = {}
    for match in re.finditer(r"^\s*(s1_[A-Za-z0-9_]+)\s*=\s*([-+]?\d+(?:\.\d+)?)\s*;", text, re.MULTILINE):
        values[match.group(1)] = float(match.group(2))
    return values


def validate_dimensional_basis() -> tuple[list[str], list[str]]:
    parameters = read_scad_numeric_parameters()
    expectations = [
        ("Scale ratio", "s1_project_scale", SCALE_RATIO, "1:87.1 project basis"),
        ("Length over coupler faces", "s1_length_over_coupler_faces", 320.0, "27.87 m full-size equivalent"),
        ("Printed sled body length", "s1_sled_body_length", 300.0, "distinct from length over coupler faces"),
        ("Structural deck length", "s1_structural_deck_length", 286.0, "supports 180 mm module with fairing overhang"),
        ("Sled body width", "s1_sled_width", 42.0, "3.66 m full-size vehicle body"),
        ("Stabilization envelope width", "s1_stabilization_envelope_width", 48.0, "4.18 m full-size including guide/stabilizer sweep"),
        ("Deck height above guideway datum", "s1_deck_height_above_g0", 12.0, "1.05 m full-size datum offset"),
        ("Module length", "s1_module_length", 180.0, "15.68 m full-size replaceable module"),
        ("Module width", "s1_module_width", 40.0, "3.48 m full-size module envelope"),
    ]
    rows: list[str] = []
    failures: list[str] = []
    for label, key, expected, rationale in expectations:
        actual = parameters.get(key)
        ok = actual is not None and abs(actual - expected) <= 0.05
        if not ok:
            failures.append(f"{key} expected {expected:g} mm for Issue #21 dimensional basis but found {actual}")
        full_size = "n/a" if actual is None or key == "s1_project_scale" else f"{actual * SCALE_RATIO / 1000:.2f} m"
        rows.append(
            f"| {label} | `{key}` | {expected:g} | {actual if actual is not None else 'missing'} | {full_size} | {'yes' if ok else 'no'} | {rationale} |"
        )
    if parameters.get("s1_length_over_coupler_faces") == parameters.get("s1_sled_body_length"):
        failures.append("s1_length_over_coupler_faces and s1_sled_body_length must remain distinct")
    return rows, failures


def validate_container_references() -> tuple[list[str], list[str]]:
    parameters = read_scad_numeric_parameters()
    expected = {
        "s1_iso_40ft_length": 12192.0 / SCALE_RATIO,
        "s1_iso_20ft_length": 6058.0 / SCALE_RATIO,
        "s1_iso_container_width": 2438.0 / SCALE_RATIO,
        "s1_iso_container_height": 2591.0 / SCALE_RATIO,
        "s1_iso_high_cube_container_height": 2896.0 / SCALE_RATIO,
    }
    labels = {
        "s1_iso_40ft_length": "HO 40-foot container length",
        "s1_iso_20ft_length": "HO 20-foot container length",
        "s1_iso_container_width": "HO ISO container width",
        "s1_iso_container_height": "HO standard container height",
        "s1_iso_high_cube_container_height": "HO high-cube height",
    }
    rows: list[str] = []
    failures: list[str] = []
    for key, expected_mm in expected.items():
        actual = parameters.get(key)
        ok = actual is not None and abs(actual - expected_mm) <= TOLERANCE_MM
        if not ok:
            failures.append(f"{key} expected {expected_mm:.2f} mm at 1:87.1 but found {actual}")
        rows.append(
            f"| {labels[key]} | `{key}` | {expected_mm:.2f} | {actual if actual is not None else 'missing'} | {'yes' if ok else 'no'} |"
        )

    pocket_40_l = parameters["s1_iso_40ft_length"] + parameters["s1_container_fit_clearance_length"]
    pocket_20_l = parameters["s1_iso_20ft_length"] + parameters["s1_container_fit_clearance_length"]
    pocket_w = parameters["s1_iso_container_width"] + parameters["s1_container_fit_clearance_width"]
    tray_40_l = pocket_40_l + 2 * parameters["s1_container_retention_clearance"]
    tray_pair_l = 2 * pocket_20_l + parameters["s1_container_20ft_gap"] + 2 * parameters["s1_container_retention_clearance"]
    tray_w = pocket_w + 2 * parameters["s1_container_retention_rail_width"]
    checks = [
        ("40-foot purchased-container pocket", pocket_40_l >= parameters["s1_iso_40ft_length"], f"{pocket_40_l:.2f} x {pocket_w:.2f} mm inside pocket"),
        ("40-foot retained tray", tray_40_l <= parameters["s1_module_length"] and tray_w <= parameters["s1_module_width"], f"{tray_40_l:.2f} x {tray_w:.2f} mm outer retention envelope"),
        ("Twin 20-foot purchased-container pockets", pocket_20_l >= parameters["s1_iso_20ft_length"], f"two {pocket_20_l:.2f} x {pocket_w:.2f} mm pockets"),
        ("Twin 20-foot retained tray", tray_pair_l <= parameters["s1_module_length"] and tray_w <= parameters["s1_module_width"], f"{tray_pair_l:.2f} x {tray_w:.2f} mm paired retention envelope"),
    ]
    for label, ok, detail in checks:
        if not ok:
            failures.append(f"{label} does not fit the recalibrated S1 module envelope")
        rows.append(f"| {label} | derived | {detail} | {detail} | {'yes' if ok else 'no'} |")
    return rows, failures


def validate_split_external_dimensions(
    all_targets: list[Target],
    mesh_infos: dict[str, MeshInfo],
) -> tuple[list[str], list[str]]:
    by_group: dict[str, dict[str, Target]] = {}
    for target in all_targets:
        if not target.split_group:
            continue
        bucket = by_group.setdefault(target.split_group, {})
        if target.output.endswith("_front_split.stl"):
            bucket["front"] = target
        elif target.output.endswith("_rear_split.stl"):
            bucket["rear"] = target
        else:
            bucket["full"] = target
    rows: list[str] = []
    failures: list[str] = []
    for group, members in sorted(by_group.items()):
        if not {"full", "front", "rear"}.issubset(members):
            failures.append(f"Split group {group} is missing a full/front/rear target")
            continue
        full = mesh_infos.get(members["full"].output)
        front = mesh_infos.get(members["front"].output)
        rear = mesh_infos.get(members["rear"].output)
        if full is None or front is None or rear is None:
            failures.append(f"Split group {group} is missing mesh info")
            continue
        combined_x = front.bbox_mm[0] + rear.bbox_mm[0]
        width_delta = abs(max(front.bbox_mm[1], rear.bbox_mm[1]) - full.bbox_mm[1])
        height_delta = abs(max(front.bbox_mm[2], rear.bbox_mm[2]) - full.bbox_mm[2])
        length_delta = abs(combined_x - full.bbox_mm[0])
        ok = length_delta <= 2 * TOLERANCE_MM and width_delta <= TOLERANCE_MM and height_delta <= TOLERANCE_MM
        if not ok:
            failures.append(
                f"Split group {group} does not preserve full external dimensions: "
                f"combined length delta {length_delta:.2f}, width delta {width_delta:.2f}, height delta {height_delta:.2f}"
            )
        rows.append(
            f"| {group} | {format_bbox(full.bbox_mm)} | {combined_x:.2f} combined split X | "
            f"{width_delta:.2f} | {height_delta:.2f} | {'yes' if ok else 'no'} |"
        )
    return rows, failures


def validate_h2c_fit(
    all_targets: list[Target],
    mesh_infos: dict[str, MeshInfo],
) -> tuple[list[str], list[str]]:
    rows: list[str] = []
    failures: list[str] = []
    for target in all_targets:
        if "_split" in target.output:
            continue
        info = mesh_infos.get(target.output)
        if info is None:
            continue
        ok = fits_h2c(info.bbox_mm)
        if target.must_fit_h2c and not ok:
            failures.append(f"{target.output} does not fit the H2C usable bed area as a one-piece asset")
        rows.append(
            f"| {target.output} | {format_bbox(info.bbox_mm)} | {H2C_BED_X_MM - 2 * H2C_MARGIN_MM:.0f} x {H2C_BED_Y_MM - 2 * H2C_MARGIN_MM:.0f} mm | {'yes' if ok else 'no'} |"
        )
    return rows, failures


def print_projects() -> list[PrintProject]:
    modules = [
        ("commuter_pod.stl", "commuter pod"),
        ("overnight_pod.stl", "overnight pod"),
        ("battery_pod.stl", "battery pod"),
        ("container_40_adapter.stl", "40-foot container adapter"),
        ("container_20_twin_adapter.stl", "twin 20-foot container adapter"),
        ("open_bin.stl", "open bin"),
        ("ballast_test_module.stl", "ballast test module"),
    ]
    projects: list[PrintProject] = []
    for output, name in modules:
        stem = Path(output).stem
        projects.append(PrintProject(
            filename=f"{stem}_module_h2c.3mf",
            title=f"S1 {name} module H2C print project",
            parts=(PrintPart(output, name),),
            notes="Single recalibrated S1 module at 100% scale.",
        ))
        projects.append(PrintProject(
            filename=f"s1_{stem}_car_h2c.3mf",
            title=f"S1 {name} complete car H2C print project",
            parts=(
                PrintPart("s1_sled_body.stl", "S1 sled body"),
                PrintPart("s1_coupler_front.stl", "front coupler"),
                PrintPart("s1_coupler_rear.stl", "rear coupler"),
                PrintPart(output, name),
            ),
            notes="H2C-oriented plate containing sled body, replaceable couplers, and one module at 100% scale.",
        ))
    projects.append(PrintProject(
        filename="s1_fixtures_h2c.3mf",
        title="S1 fixtures H2C print project",
        parts=(
            PrintPart("cg_test_fixture.stl", "CG test fixture"),
            PrintPart("coupler_angle_gauge.stl", "coupler angle gauge"),
            PrintPart("route_clearance_gauge.stl", "route clearance gauge"),
            PrintPart("split_alignment_keys.stl", "split alignment keys"),
        ),
        notes="Measurement and assembly fixtures at 100% scale.",
    ))
    return projects


def write_3mf_projects(projects: list[PrintProject]) -> None:
    THREE_MF_DIR.mkdir(parents=True, exist_ok=True)
    for project in projects:
        object_meshes = [load_mesh_for_3mf(STL_DIR / part.output) for part in project.parts]
        placements = pack_project_parts(project, object_meshes)
        model_xml = three_mf_model_xml(project, object_meshes, placements)
        metadata = {
            "title": project.title,
            "notes": project.notes,
            "bed": "Bambu H2C-oriented 320 x 320 mm nominal plate",
            "usable_bed_mm": [H2C_BED_X_MM - 2 * H2C_MARGIN_MM, H2C_BED_Y_MM - 2 * H2C_MARGIN_MM],
            "scale": "100%",
            "orientation": "flat on generated STL datum",
            "recommended_settings": {
                "layer_height_mm": "0.16-0.24",
                "walls": "3+",
                "infill": "20-35% shells, 40-60% fixtures/couplers",
                "supports": "avoid sockets; light supports only under taper if required",
            },
        }
        path = THREE_MF_DIR / project.filename
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", content_types_xml())
            archive.writestr("_rels/.rels", rels_xml())
            archive.writestr("3D/3dmodel.model", model_xml)
            archive.writestr("Metadata/atos-print-settings.json", json.dumps(metadata, indent=2, sort_keys=True))


def load_mesh_for_3mf(path: Path):
    try:
        import trimesh  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError("3MF generation requires trimesh from tools/cad/requirements.txt") from exc
    return trimesh.load_mesh(path, force="mesh")


def pack_project_parts(project: PrintProject, meshes) -> list[tuple[float, float, float]]:
    placements: list[tuple[float, float, float]] = []
    cursor_x = H2C_MARGIN_MM
    cursor_y = H2C_MARGIN_MM
    row_height = 0.0
    spacing = 6.0
    for part, mesh in zip(project.parts, meshes):
        extent_x = float(mesh.extents[0])
        extent_y = float(mesh.extents[1])
        if cursor_x + extent_x > H2C_BED_X_MM - H2C_MARGIN_MM + TOLERANCE_MM:
            cursor_x = H2C_MARGIN_MM
            cursor_y += row_height + spacing
            row_height = 0.0
        if cursor_y + extent_y > H2C_BED_Y_MM - H2C_MARGIN_MM + TOLERANCE_MM:
            raise RuntimeError(f"{project.filename} cannot pack {part.output} on the declared H2C bed")
        min_x, min_y, min_z = (float(value) for value in mesh.bounds[0])
        placements.append((cursor_x - min_x, cursor_y - min_y, -min_z))
        cursor_x += extent_x + spacing
        row_height = max(row_height, extent_y)
    return placements


def three_mf_model_xml(project: PrintProject, meshes, placements: list[tuple[float, float, float]]) -> bytes:
    ns = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
    ET.register_namespace("", ns)
    model = ET.Element(f"{{{ns}}}model", {"unit": "millimeter", "{http://www.w3.org/XML/1998/namespace}lang": "en-US"})
    ET.SubElement(model, f"{{{ns}}}metadata", {"name": "Title"}).text = project.title
    ET.SubElement(model, f"{{{ns}}}metadata", {"name": "Application"}).text = "ATOS S1 CAD validator"
    resources = ET.SubElement(model, f"{{{ns}}}resources")
    build = ET.SubElement(model, f"{{{ns}}}build")
    for index, (part, mesh, placement) in enumerate(zip(project.parts, meshes, placements), start=1):
        obj = ET.SubElement(resources, f"{{{ns}}}object", {"id": str(index), "type": "model", "name": part.name})
        mesh_node = ET.SubElement(obj, f"{{{ns}}}mesh")
        vertices = ET.SubElement(mesh_node, f"{{{ns}}}vertices")
        for vertex in mesh.vertices:
            ET.SubElement(vertices, f"{{{ns}}}vertex", {
                "x": f"{float(vertex[0]):.6f}",
                "y": f"{float(vertex[1]):.6f}",
                "z": f"{float(vertex[2]):.6f}",
            })
        triangles = ET.SubElement(mesh_node, f"{{{ns}}}triangles")
        for face in mesh.faces:
            ET.SubElement(triangles, f"{{{ns}}}triangle", {
                "v1": str(int(face[0])),
                "v2": str(int(face[1])),
                "v3": str(int(face[2])),
            })
        transform = " ".join([
            "1", "0", "0",
            "0", "1", "0",
            "0", "0", "1",
            f"{placement[0]:.6f}", f"{placement[1]:.6f}", f"{placement[2]:.6f}",
        ])
        ET.SubElement(build, f"{{{ns}}}item", {"objectid": str(index), "transform": transform})
    return ET.tostring(model, encoding="utf-8", xml_declaration=True)


def content_types_xml() -> str:
    return "\n".join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
        '  <Default Extension="json" ContentType="application/json"/>',
        '</Types>',
        "",
    ])


def rels_xml() -> str:
    return "\n".join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
        '</Relationships>',
        "",
    ])


def validate_3mf_projects(
    projects: list[PrintProject],
    _mesh_infos: dict[str, MeshInfo],
) -> tuple[list[str], list[str]]:
    ns = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}
    rows: list[str] = []
    failures: list[str] = []
    for project in projects:
        path = THREE_MF_DIR / project.filename
        if not path.exists():
            failures.append(f"Missing 3MF project: {project.filename}")
            continue
        try:
            with zipfile.ZipFile(path) as archive:
                names = set(archive.namelist())
                required = {"[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model", "Metadata/atos-print-settings.json"}
                missing = required - names
                if missing:
                    failures.append(f"{project.filename} is missing required 3MF entries: {sorted(missing)}")
                    continue
                root = ET.fromstring(archive.read("3D/3dmodel.model"))
        except (zipfile.BadZipFile, ET.ParseError) as exc:
            failures.append(f"{project.filename} is not a readable 3MF archive: {exc}")
            continue
        unit_ok = root.attrib.get("unit") == "millimeter"
        objects = root.findall(".//m:object", ns)
        items = root.findall(".//m:build/m:item", ns)
        expected_names = [part.name for part in project.parts]
        actual_names = [obj.attrib.get("name", "") for obj in objects]
        names_ok = actual_names == expected_names
        count_ok = len(objects) == len(project.parts) and len(items) == len(project.parts)
        scale_ok = True
        fit_ok = True
        bounds_by_object: dict[str, tuple[float, float, float, float]] = {}
        for obj in objects:
            vertices = [
                (
                    float(vertex.attrib["x"]),
                    float(vertex.attrib["y"]),
                )
                for vertex in obj.findall(".//m:vertex", ns)
            ]
            if not vertices:
                fit_ok = False
                continue
            bounds_by_object[obj.attrib["id"]] = (
                min(vertex[0] for vertex in vertices),
                min(vertex[1] for vertex in vertices),
                max(vertex[0] for vertex in vertices),
                max(vertex[1] for vertex in vertices),
            )
        for item in items:
            transform = [float(value) for value in item.attrib.get("transform", "").split()]
            if len(transform) != 12:
                scale_ok = False
                fit_ok = False
                continue
            if transform[:9] != [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]:
                scale_ok = False
            tx, ty = transform[9], transform[10]
            bounds = bounds_by_object.get(item.attrib["objectid"])
            if bounds is None:
                fit_ok = False
                continue
            min_x, min_y, max_x, max_y = bounds
            placed = (min_x + tx, min_y + ty, max_x + tx, max_y + ty)
            if placed[0] < -TOLERANCE_MM or placed[1] < -TOLERANCE_MM:
                fit_ok = False
            if placed[2] > H2C_BED_X_MM + TOLERANCE_MM or placed[3] > H2C_BED_Y_MM + TOLERANCE_MM:
                fit_ok = False
        ok = unit_ok and names_ok and count_ok and scale_ok and fit_ok
        if not ok:
            failures.append(
                f"{project.filename} failed 3MF validation: "
                f"unit={unit_ok}, names={names_ok}, count={count_ok}, scale={scale_ok}, fit={fit_ok}"
            )
        rows.append(
            f"| {project.filename} | {len(project.parts)} | {'yes' if unit_ok else 'no'} | "
            f"{'yes' if names_ok else 'no'} | {'yes' if scale_ok else 'no'} | {'yes' if fit_ok else 'no'} | {project.notes} |"
        )
    return rows, failures


def write_report(
    rows: list[str],
    failures: list[str],
    known_gaps: list[str],
    basis_rows: list[str],
    container_rows: list[str],
    split_rows: list[str],
    h2c_rows: list[str],
    project_rows: list[str],
    interface_rows: list[str],
) -> None:
    status = "FAIL" if failures else "CONDITIONAL PASS" if known_gaps else "PASS"
    REPORT_PATH.write_text(
        "\n".join([
            "# S1 CAD Asset Report",
            "",
            "Generated by `python3 tools/cad/s1_generate_and_validate.py`.",
            "",
            "The report validates prototype CAD assets for file presence, OpenSCAD renderability, bounding boxes, volume, watertight meshes when `trimesh` is available, declared 1:87 envelopes, 220 x 220 mm print-bed fit for direct or split parts, H2C one-piece fit, 3MF project contents, and generated preview coverage.",
            "",
            "## Results",
            "",
            "| STL | Target | Bounding box XYZ mm | Volume mm3 | Triangles | Watertight | Envelope OK | 220 bed fit | H2C fit | Notes |",
            "|---|---|---:|---:|---:|---|---|---|---|---|",
            *rows,
            "",
            "## Validation status",
            "",
            status,
            "",
            *[f"- {failure}" for failure in failures],
            *[f"- Known mesh gap: {gap}" for gap in known_gaps],
            "",
            "## 1:87 Dimensional Basis",
            "",
            "| Dimension | Parameter | Expected mm | Actual mm | Full-size equivalent | OK | Rationale |",
            "|---|---|---:|---:|---:|---|---|",
            *basis_rows,
            "",
            "## Container Reference Validation",
            "",
            "| Check | Parameter | Expected / derived mm | Actual / derived mm | OK |",
            "|---|---|---:|---:|---|",
            *container_rows,
            "",
            "The 40-foot and twin-20 adapters are carrier pockets for purchased HO-scale containers. The printed adapter STLs are not treated as printed container bodies.",
            "",
            "## Split external-dimension validation",
            "",
            "| Group | Full bbox XYZ mm | Split combined X | Width delta mm | Height delta mm | OK |",
            "|---|---:|---:|---:|---:|---|",
            *split_rows,
            "",
            "## H2C one-piece fit validation",
            "",
            "| STL | Bounding box XYZ mm | Usable H2C bed | Fits |",
            "|---|---:|---:|---|",
            *h2c_rows,
            "",
            "## 3MF project validation",
            "",
            "| 3MF | Objects | Millimeter units | Expected objects | 100% scale | Bed fit | Notes |",
            "|---|---:|---|---|---|---|---|",
            *project_rows,
            "",
            "## Preview status",
            "",
            f"- Generated {PREVIEW_DIR.relative_to(ROOT)}/index.svg as the contact sheet for major S1 parts.",
            f"- Generated individual STL-derived SVG previews in {PREVIEW_DIR.relative_to(ROOT)}/.",
            f"- Generated Bambu-compatible 3MF project archives in {THREE_MF_DIR.relative_to(ROOT)}/.",
            "",
            "## Module interface fit validation",
            "",
            "| Source | Shared helper | Present | Interface geometry |",
            "|---|---|---|---|",
            *interface_rows,
            "",
            "Every reference module base and the standalone interface plate must use the shared S1 interface helper so the same four mount-pin holes and latch slots are present at the common attachment stations.",
            "",
            "## Split mesh validation",
            "",
            "- Split STLs are rendered from OpenSCAD and then normalized through `manifold3d` to remove split-plane duplicate-face artifacts before validation.",
            "- Validation fails by default if any STL lacks watertight proof. `--allow-known-gaps` is reserved for diagnostic runs and is not used for acceptance.",
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
    parser.add_argument(
        "--allow-known-gaps",
        action="store_true",
        help="Permit documented known mesh gaps for diagnostic runs. Acceptance validation must not use this flag.",
    )
    args = parser.parse_args()
    _rows, failures, known_gaps = validate_targets(targets(), render=not args.no_render)
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1
    if known_gaps and not args.allow_known_gaps:
        for gap in known_gaps:
            print(f"KNOWN-GAP: {gap}")
        print("FAIL: known mesh gaps require --allow-known-gaps and do not satisfy acceptance validation.")
        return 1
    for gap in known_gaps:
        print(f"KNOWN-GAP: {gap}")
    action = "Validated existing" if args.no_render else "Rendered and validated"
    print(f"{action} {len(targets())} S1 CAD STL assets.")
    print(f"Wrote {REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
