include <../s1_parameters.scad>

build_part = "full";

module commuter_pod_full() {
  union() {
    s1_interface_plate_full_placeholder();
    translate([0, 0, s1_module_interface_height - 0.3])
      aerodynamic_pod_shell(s1_module_length, s1_module_width, s1_commuter_pod_height, nose = 22, roof_inset = 8, radius = 4);
    for (x = [-54, -18, 18, 54])
      translate([x, s1_module_width / 2 - 5.2, 20])
        rounded_box([20, 1.3, 9], 1.4);
    for (x = [-54, -18, 18, 54])
      translate([x, -s1_module_width / 2 + 5.2, 20])
        rounded_box([20, 1.3, 9], 1.4);
    side_panel_breaks(s1_module_length - 28, s1_module_width, 15, 7);
    cg_marker(s1_module_interface_height + s1_commuter_pod_height + 0.2, 11);
  }
}

module s1_interface_plate_full_placeholder() {
  module_interface_base(cutout_height = 14);
}

module commuter_pod_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { commuter_pod_full(); split_front_clip(s1_module_length, 70, 90); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { commuter_pod_full(); split_rear_clip(s1_module_length, 70, 90); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    commuter_pod_full();
}

commuter_pod_part();
