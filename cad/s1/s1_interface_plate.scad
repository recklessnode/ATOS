include <s1_parameters.scad>

build_part = "full";

module s1_interface_plate_full() {
  difference() {
    union() {
      rounded_box([s1_module_length, s1_module_width, s1_module_interface_height], 6);
      module_attachment_positions()
        translate([0, 0, s1_module_interface_height])
          cylinder(h = 3, r = 5.2);
      translate([0, 0, s1_module_interface_height + 0.6])
        centerline_marks(s1_module_length - 10, s1_module_width - 8, 0, height = 1.0);
      cg_marker(s1_module_interface_height + 1.2, 18);
    }
    module_interface_cutouts(height = 18);
  }
}

module s1_interface_plate_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() {
        s1_interface_plate_full();
        split_front_clip(s1_module_length, 100, 60);
      }
      split_alignment_sockets("front", z = 0.4);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() {
        s1_interface_plate_full();
        split_rear_clip(s1_module_length, 100, 60);
      }
      split_alignment_sockets("rear", z = 0.4);
    }
  else
    s1_interface_plate_full();
}

s1_interface_plate_part();
