include <../s1_parameters.scad>

build_part = "full";

module short_container(x) {
  translate([x, 0, s1_module_interface_height + 7])
    rounded_box([92, s1_module_width - 16, 34], 3);
  for (rib = [-24, 0, 24])
    translate([x + rib, s1_module_width / 2 - 10, s1_module_interface_height + 7])
      cube([1.4, 4, 32]);
}

module container_20_twin_adapter_full() {
  union() {
    difference() {
      module_interface_base(cutout_height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      rounded_box([s1_module_length - 18, s1_module_width - 10, 7], 3);
    short_container(-54);
    short_container(54);
    translate([0, 0, s1_module_interface_height + 8])
      rounded_box([8, s1_module_width - 14, 36], 2);
    cg_marker(48, 14);
  }
}

module container_20_twin_adapter_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { container_20_twin_adapter_full(); split_front_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { container_20_twin_adapter_full(); split_rear_clip(s1_module_length, 110, 120); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    container_20_twin_adapter_full();
}

container_20_twin_adapter_part();
