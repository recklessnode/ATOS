include <../s1_parameters.scad>

build_part = "full";

module open_bin_full() {
  union() {
    difference() {
      module_interface_base(cutout_height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      difference() {
        rounded_box([s1_module_length - 20, s1_module_width - 8, 38], 5);
        translate([0, 0, 6])
          rounded_box([s1_module_length - 36, s1_module_width - 24, 40], 4);
      }
    ballast_blocks(z = 12);
    cg_marker(48, 14);
  }
}

module open_bin_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { open_bin_full(); split_front_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { open_bin_full(); split_rear_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    open_bin_full();
}

open_bin_part();
