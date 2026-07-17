include <s1_parameters.scad>

build_part = "full";

module s1_sled_core() {
  difference() {
    union() {
      linear_extrude(height = s1_sled_height)
        polygon(points = [
          [-s1_length_over_coupler_faces / 2, 0],
          [-s1_structural_deck_length / 2, -s1_sled_width / 2],
          [s1_structural_deck_length / 2, -s1_sled_width / 2],
          [s1_length_over_coupler_faces / 2, 0],
          [s1_structural_deck_length / 2, s1_sled_width / 2],
          [-s1_structural_deck_length / 2, s1_sled_width / 2]
        ]);
      translate([0, 0, s1_sled_height])
        rounded_box([s1_structural_deck_length, s1_sled_width - 6, 3], 8);
      translate([0, s1_sled_width / 2 - 4, s1_sled_height + 2])
        rounded_box([s1_structural_deck_length - 20, 5, 5], 2);
      translate([0, -s1_sled_width / 2 + 4, s1_sled_height + 2])
        rounded_box([s1_structural_deck_length - 20, 5, 5], 2);
    }

    translate([0, 0, s1_sled_height + 1])
      mount_pin_holes(height = 24);
    translate([0, 0, s1_sled_height + 2])
      latch_slots(height = 10);
    ballast_pocket_positions()
      translate([0, 0, s1_sled_height - s1_ballast_pocket_depth + 1])
        rounded_box([s1_ballast_pocket_length, s1_ballast_pocket_width, s1_ballast_pocket_depth + 4], 3);
    translate([0, 0, s1_sled_height - s1_ballast_channel_depth + 1])
      rounded_box([s1_ballast_channel_length, s1_ballast_channel_width, s1_ballast_channel_depth + 4], 3);
  }
}

module s1_sled_detail() {
  union() {
    s1_sled_core();
    centerline_marks(s1_structural_deck_length - 12, s1_sled_width - 12, s1_sled_height + 3.5);
    cg_marker(s1_sled_height + 4.1, 20);
    module_attachment_positions()
      translate([0, 0, s1_sled_height + 3.2])
        cylinder(h = 1.2, r = 4.2);
    support_node_positions()
      translate([0, 0, -1.2])
        rounded_box([22, 12, 1.2], 2);
    translate([-s1_coupler_pivot_spacing / 2, 0, s1_sled_height / 2])
      rotate([90, 0, 0])
        cylinder(h = s1_sled_width + 5, r = 2.2, center = true);
    translate([s1_coupler_pivot_spacing / 2, 0, s1_sled_height / 2])
      rotate([90, 0, 0])
        cylinder(h = s1_sled_width + 5, r = 2.2, center = true);
  }
}

module s1_sled_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() {
        s1_sled_detail();
        split_front_clip(s1_length_over_coupler_faces, 120, 90);
      }
      split_alignment_sockets("front", z = 1.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() {
        s1_sled_detail();
        split_rear_clip(s1_length_over_coupler_faces, 120, 90);
      }
      split_alignment_sockets("rear", z = 1.5);
    }
  else
    s1_sled_detail();
}

s1_sled_part();
