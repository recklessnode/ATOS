include <../s1_parameters.scad>

build_part = "full";

module overnight_pod_full() {
  union() {
    difference() {
      rounded_box([s1_module_length, s1_module_width, s1_module_interface_height], 6);
      mount_pin_holes(height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      aerodynamic_pod_shell(s1_module_length, s1_module_width, 52, nose = 22, roof_inset = 10, radius = 8);
    for (x = [-64, 64])
      translate([x, s1_module_width / 2 - 8, 30])
        rounded_box([46, 1.6, 14], 2);
    for (x = [-64, 64])
      translate([x, -s1_module_width / 2 + 8, 30])
        rounded_box([46, 1.6, 14], 2);
    translate([0, s1_module_width / 2 - 8, 18])
      rounded_box([28, 1.6, 18], 2);
    translate([0, -s1_module_width / 2 + 8, 18])
      rounded_box([28, 1.6, 18], 2);
    cg_marker(60, 14);
  }
}

module overnight_pod_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { overnight_pod_full(); split_front_clip(s1_module_length, 110, 130); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { overnight_pod_full(); split_rear_clip(s1_module_length, 110, 130); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    overnight_pod_full();
}

overnight_pod_part();
