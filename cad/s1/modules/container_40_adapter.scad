include <../s1_parameters.scad>

build_part = "full";

module container_corner_pad(x, y, height) {
  translate([x, y, s1_module_interface_height + 1.8])
    rounded_box([7, 4, height], 1.2);
}

module container_40_adapter_full() {
  pocket_l = s1_iso_40ft_length + s1_container_fit_clearance_length;
  pocket_w = s1_iso_container_width + s1_container_fit_clearance_width;
  tray_l = pocket_l + 2 * s1_container_retention_clearance;
  tray_w = pocket_w + 2 * s1_container_retention_rail_width;
  rail_z = s1_module_interface_height + 2.2;
  union() {
    difference() {
      module_interface_base(cutout_height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      rounded_box([tray_l + 6, tray_w + 3, 2.4], 2.2);
    translate([0, pocket_w / 2 + s1_container_retention_rail_width / 2, rail_z])
      rounded_box([pocket_l + 6, s1_container_retention_rail_width, s1_container_retention_rail_height], 0.8);
    translate([0, -pocket_w / 2 - s1_container_retention_rail_width / 2, rail_z])
      rounded_box([pocket_l + 6, s1_container_retention_rail_width, s1_container_retention_rail_height], 0.8);
    translate([pocket_l / 2 + s1_container_retention_rail_width / 2, 0, rail_z])
      rounded_box([s1_container_retention_rail_width, tray_w, s1_container_retention_rail_height], 0.8);
    translate([-pocket_l / 2 - s1_container_retention_rail_width / 2, 0, rail_z])
      rounded_box([s1_container_retention_rail_width, tray_w, s1_container_retention_rail_height], 0.8);
    for (x = [-pocket_l / 2, pocket_l / 2])
      for (y = [-pocket_w / 2, pocket_w / 2])
        container_corner_pad(x, y, 1.2);
    translate([0, 0, rail_z + s1_container_retention_rail_height + 0.1])
      centerline_marks(pocket_l, pocket_w, 0, height = 0.6);
    cg_marker(rail_z + s1_container_retention_rail_height + 0.5, 10);
  }
}

module container_40_adapter_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { container_40_adapter_full(); split_front_clip(s1_module_length, 70, 70); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { container_40_adapter_full(); split_rear_clip(s1_module_length, 70, 70); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    container_40_adapter_full();
}

container_40_adapter_part();
