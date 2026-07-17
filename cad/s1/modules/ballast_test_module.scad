include <../s1_parameters.scad>

build_part = "full";

module elevated_ballast_tower() {
  translate([0, 0, s1_module_interface_height])
    rounded_box([38, 26, 46], 4);
  translate([0, 0, s1_module_interface_height + 46])
    rounded_box([64, 30, 10], 4);
}

module ballast_test_module_full() {
  union() {
    difference() {
      rounded_box([s1_module_length, s1_module_width, s1_module_interface_height], 6);
      mount_pin_holes(height = 14);
      ballast_pocket_positions()
        translate([0, 0, -1])
          rounded_box([s1_ballast_pocket_length, s1_ballast_pocket_width, s1_module_interface_height + 2], 3);
      translate([0, 0, -1])
        rounded_box([s1_ballast_channel_length, s1_ballast_channel_width, s1_module_interface_height + 2], 3);
    }
    ballast_pocket_positions()
      translate([0, 0, s1_module_interface_height])
        rounded_box([s1_ballast_pocket_length - 6, s1_ballast_pocket_width - 4, 8], 2);
    translate([0, 0, s1_module_interface_height])
      rounded_box([s1_ballast_channel_length - 8, s1_ballast_channel_width - 4, 8], 2);
    elevated_ballast_tower();
    centerline_marks(s1_module_length - 10, s1_module_width - 8, s1_module_interface_height + 9);
    cg_marker(s1_module_interface_height + 58, 18);
  }
}

module ballast_test_module_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { ballast_test_module_full(); split_front_clip(s1_module_length, 110, 140); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { ballast_test_module_full(); split_rear_clip(s1_module_length, 110, 140); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    ballast_test_module_full();
}

ballast_test_module_part();
