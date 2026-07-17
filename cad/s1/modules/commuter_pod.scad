include <../s1_parameters.scad>

build_part = "full";

module commuter_pod_full() {
  union() {
    s1_interface_plate_full_placeholder();
    translate([0, 0, s1_module_interface_height - 0.3])
      aerodynamic_pod_shell(s1_module_length, s1_module_width, 44, nose = 28, roof_inset = 16, radius = 8);
    for (x = [-66, -22, 22, 66])
      translate([x, s1_module_width / 2 - 8, 24])
        rounded_box([28, 1.6, 14], 2);
    for (x = [-66, -22, 22, 66])
      translate([x, -s1_module_width / 2 + 8, 24])
        rounded_box([28, 1.6, 14], 2);
    side_panel_breaks(s1_module_length - 36, s1_module_width, 18, 8);
    cg_marker(52, 14);
  }
}

module s1_interface_plate_full_placeholder() {
  difference() {
    rounded_box([s1_module_length, s1_module_width, s1_module_interface_height], 6);
    mount_pin_holes(height = 14);
  }
}

module commuter_pod_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { commuter_pod_full(); split_front_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { commuter_pod_full(); split_rear_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    commuter_pod_full();
}

commuter_pod_part();
