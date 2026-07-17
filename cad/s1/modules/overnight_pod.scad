include <../s1_parameters.scad>

build_part = "full";

module overnight_pod_full() {
  union() {
    difference() {
      module_interface_base(cutout_height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      aerodynamic_pod_shell(s1_module_length, s1_module_width, s1_overnight_pod_height, nose = 18, roof_inset = 7, radius = 4);
    for (x = [-52, 52])
      translate([s1_scaled_feature(x), s1_module_width / 2 - 5.2, s1_scaled_pod_z(25, s1_overnight_pod_height, 40)])
        rounded_box([s1_scaled_feature_size(36), 1.3, s1_scaled_pod_size(10, s1_overnight_pod_height, 40)], 1.4);
    for (x = [-52, 52])
      translate([s1_scaled_feature(x), -s1_module_width / 2 + 5.2, s1_scaled_pod_z(25, s1_overnight_pod_height, 40)])
        rounded_box([s1_scaled_feature_size(36), 1.3, s1_scaled_pod_size(10, s1_overnight_pod_height, 40)], 1.4);
    translate([0, s1_module_width / 2 - 5.2, s1_scaled_pod_z(17, s1_overnight_pod_height, 40)])
      rounded_box([s1_scaled_feature_size(24), 1.3, s1_scaled_pod_size(12, s1_overnight_pod_height, 40)], 1.4);
    translate([0, -s1_module_width / 2 + 5.2, s1_scaled_pod_z(17, s1_overnight_pod_height, 40)])
      rounded_box([s1_scaled_feature_size(24), 1.3, s1_scaled_pod_size(12, s1_overnight_pod_height, 40)], 1.4);
    cg_marker(s1_module_interface_height + s1_overnight_pod_height + 0.2, 11);
  }
}

module overnight_pod_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { overnight_pod_full(); split_front_clip(s1_module_length, s1_module_width + 30, s1_module_interface_height + s1_overnight_pod_height + 70); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { overnight_pod_full(); split_rear_clip(s1_module_length, s1_module_width + 30, s1_module_interface_height + s1_overnight_pod_height + 70); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    overnight_pod_full();
}

overnight_pod_part();
