include <../s1_parameters.scad>

build_part = "full";

module service_vents(y) {
  for (x = [-72, -48, -24, 24, 48, 72])
    translate([x, y, 28])
      rounded_box([12, 1.6, 9], 1.2);
}

module battery_pod_full() {
  union() {
    difference() {
      module_interface_base(cutout_height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      aerodynamic_pod_shell(s1_module_length, s1_module_width, 38, nose = 18, roof_inset = 8, radius = 7);
    translate([0, 0, 14])
      rounded_box([150, s1_module_width - 12, 8], 4);
    service_vents(s1_module_width / 2 - 8);
    service_vents(-s1_module_width / 2 + 8);
    cg_marker(47, 14);
  }
}

module battery_pod_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { battery_pod_full(); split_front_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { battery_pod_full(); split_rear_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    battery_pod_full();
}

battery_pod_part();
