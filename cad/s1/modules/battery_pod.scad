include <../s1_parameters.scad>

build_part = "full";

module service_vents(y) {
  for (x = [-56, -34, -12, 12, 34, 56])
    translate([x, y, 21])
      rounded_box([10, 1.2, 7], 1.0);
}

module battery_pod_full() {
  union() {
    difference() {
      module_interface_base(cutout_height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      aerodynamic_pod_shell(s1_module_length, s1_module_width, s1_battery_pod_height, nose = 18, roof_inset = 7, radius = 4);
    translate([0, 0, 12])
      rounded_box([128, s1_module_width - 10, 6], 3);
    service_vents(s1_module_width / 2 - 5.2);
    service_vents(-s1_module_width / 2 + 5.2);
    cg_marker(s1_module_interface_height + s1_battery_pod_height + 0.2, 11);
  }
}

module battery_pod_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { battery_pod_full(); split_front_clip(s1_module_length, 70, 88); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { battery_pod_full(); split_rear_clip(s1_module_length, 70, 88); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    battery_pod_full();
}

battery_pod_part();
