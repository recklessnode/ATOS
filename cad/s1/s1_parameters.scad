// Shared S1 prototype parameters.
// Units are millimeters. Values are provisional fit/geometry defaults.

$fn = 32;

s1_length_over_coupler_faces = 320;
s1_structural_deck_length = 280;
s1_sled_width = 72;
s1_sled_height = 14;
s1_deck_height_above_g0 = 30;
s1_wall_thickness = 2.4;
s1_corner_radius = 6;
s1_printer_tolerance = 0.35;
s1_min_feature = 1.2;

s1_module_length = 240;
s1_module_width = 64;
s1_module_interface_height = 5;
s1_module_corner_radius = 7;

s1_mount_x = 90;
s1_mount_y = 24;
s1_mount_pin_diameter = 5;
s1_mount_clearance = 0.35;
s1_latch_slot_length = 18;
s1_latch_slot_width = 6;

s1_coupler_pivot_spacing = 280;
s1_coupler_drawbar_length = 28;
s1_coupler_pivot_diameter = 8;
s1_coupler_yaw_normal_deg = 15;
s1_coupler_yaw_hard_stop_deg = 18;
s1_coupler_vertical_play = 1.5;

s1_ballast_pocket_length = 36;
s1_ballast_pocket_width = 18;
s1_ballast_pocket_depth = 6;
s1_ballast_channel_length = 108;
s1_ballast_channel_width = 14;
s1_ballast_channel_depth = 5;

s1_split_key_length = 14;
s1_split_key_width = 8;
s1_split_key_height = 5;
s1_split_plane_x = 0;

s1_support_node_x = 180;
s1_support_node_y = 50;

s1_bed_x = 220;
s1_bed_y = 220;

module rounded_box(size, radius = 3) {
  r = min(radius, min(size[0], size[1]) / 2 - 0.01);
  hull() {
    for (x = [-size[0] / 2 + r, size[0] / 2 - r])
      for (y = [-size[1] / 2 + r, size[1] / 2 - r])
        translate([x, y, 0])
          cylinder(h = size[2], r = r);
  }
}

module datum_cross(size = 18, height = 0.9, width = 1.4) {
  translate([0, -width / 2, 0]) cube([size, width, height], center = true);
  translate([-width / 2, 0, 0]) cube([width, size, height], center = true);
}

module centerline_marks(length, width, z, height = 0.8) {
  translate([0, -0.55, z]) cube([length, 1.1, height], center = true);
  translate([-0.55, 0, z]) cube([1.1, width, height], center = true);
}

module module_attachment_positions() {
  for (x = [-s1_mount_x, s1_mount_x])
    for (y = [-s1_mount_y, s1_mount_y])
      translate([x, y, 0]) children();
}

module support_node_positions() {
  for (x = [-s1_support_node_x / 2, s1_support_node_x / 2])
    for (y = [-s1_support_node_y / 2, s1_support_node_y / 2])
      translate([x, y, 0]) children();
}

module ballast_pocket_positions() {
  for (x = [-70, 70])
    for (y = [-20, 20])
      translate([x, y, 0]) children();
}

module mount_pin_holes(height = 30, clearance = s1_mount_clearance) {
  module_attachment_positions()
    cylinder(h = height, r = s1_mount_pin_diameter / 2 + clearance, center = true);
}

module latch_slots(height = 20, clearance = s1_mount_clearance) {
  module_attachment_positions()
    translate([0, 0, 0])
      rounded_box([s1_latch_slot_length + clearance, s1_latch_slot_width + clearance, height], 1.5);
}

module module_interface_underside(height = 4) {
  module_attachment_positions()
    cylinder(h = height, r = s1_mount_pin_diameter / 2, center = false);
}

module split_front_clip(length, width = 180, height = 180) {
  translate([length / 4 + 0.02, 0, height / 2 - 20])
    cube([length / 2 + 0.04, width, height], center = true);
}

module split_rear_clip(length, width = 180, height = 180) {
  translate([-length / 4 - 0.02, 0, height / 2 - 20])
    cube([length / 2 + 0.04, width, height], center = true);
}

module split_alignment_male(z = 2, clearance = 0) {
  for (y = [-18, 18])
    translate([
      -s1_split_key_length + clearance,
      y - s1_split_key_width / 2 + clearance,
      z
    ])
      cube([
        s1_split_key_length + 10,
        s1_split_key_width - 2 * clearance,
        s1_split_key_height - 2 * clearance
      ]);
}

module split_alignment_receiver(z = 2) {
  split_alignment_male(z = z - s1_printer_tolerance / 2, clearance = -s1_printer_tolerance);
}

module split_alignment_sockets(side = "front", z = 0.4) {
  // Split halves use flat, non-cosmetic joining faces for watertight STL output.
  // Loose alignment keys are printed separately and bonded across the underside seam.
}

module loose_alignment_keys() {
  for (y = [-8, 8])
    translate([0, y, 0])
      rounded_box([44, s1_split_key_width - 0.4, s1_split_key_height - 0.4], 1.2);
}

module module_split_keys_front(z = 2) {
  split_alignment_male(z = z);
}

module module_split_keys_rear(z = 2) {
  split_alignment_receiver(z = z);
}

module aerodynamic_pod_shell(length, width, height, nose = 24, roof_inset = 10, radius = 7) {
  hull() {
    rounded_box([length, width, 3], radius);
    translate([0, 0, height - 3])
      rounded_box([length - 2 * nose, width - roof_inset, 3], max(2, radius - 2));
  }
}

module side_panel_breaks(length, width, z, height = 1.0) {
  for (x = [-length / 4, 0, length / 4])
    translate([x, width / 2 - 8, z])
      cube([1.2, 1.4, height], center = true);
  for (x = [-length / 4, 0, length / 4])
    translate([x, -width / 2 + 8, z])
      cube([1.2, 1.4, height], center = true);
}

module cg_marker(z, size = 16) {
  translate([0, 0, z]) datum_cross(size = size, height = 0.8, width = 1.2);
}

module ballast_blocks(z = 5) {
  ballast_pocket_positions()
    translate([0, 0, z])
      rounded_box([s1_ballast_pocket_length - 5, s1_ballast_pocket_width - 4, 6], 2);
}

module module_half(part, length, width, height) {
  if (part == "front")
    split_front_clip(length, width, height) children();
  else if (part == "rear")
    split_rear_clip(length, width, height) children();
  else
    children();
}
