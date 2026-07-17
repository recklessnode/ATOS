include <../s1_parameters.scad>

build_part = "full";

module container_20_corner_pad(x, y, height) {
  translate([x, y, s1_module_interface_height + 1.8])
    rounded_box([6, 4, height], 1.2);
}

module container_20_twin_adapter_full() {
  pocket_l = s1_iso_20ft_length + s1_container_fit_clearance_length;
  pocket_w = s1_iso_container_width + s1_container_fit_clearance_width;
  pair_l = 2 * pocket_l + s1_container_20ft_gap;
  tray_w = pocket_w + 2 * s1_container_retention_rail_width;
  rail_z = s1_module_interface_height + 2.2;
  front_center = pocket_l / 2 + s1_container_20ft_gap / 2;
  rear_center = -front_center;
  union() {
    difference() {
      module_interface_base(cutout_height = 14);
    }
    translate([0, 0, s1_module_interface_height - 0.3])
      rounded_box([pair_l + 8, tray_w + 3, 2.4], 2.2);
    translate([0, pocket_w / 2 + s1_container_retention_rail_width / 2, rail_z])
      rounded_box([pair_l + 8, s1_container_retention_rail_width, s1_container_retention_rail_height], 0.8);
    translate([0, -pocket_w / 2 - s1_container_retention_rail_width / 2, rail_z])
      rounded_box([pair_l + 8, s1_container_retention_rail_width, s1_container_retention_rail_height], 0.8);
    for (x = [
      -pair_l / 2 - s1_container_retention_rail_width / 2,
      0,
      pair_l / 2 + s1_container_retention_rail_width / 2
    ])
      translate([x, 0, rail_z])
        rounded_box([s1_container_retention_rail_width, tray_w, s1_container_retention_rail_height], 0.8);
    for (center = [rear_center, front_center])
      for (x = [center - pocket_l / 2, center + pocket_l / 2])
        for (y = [-pocket_w / 2, pocket_w / 2])
          container_20_corner_pad(x, y, 1.2);
    translate([rear_center, 0, rail_z + s1_container_retention_rail_height + 0.1])
      centerline_marks(pocket_l, pocket_w, 0, height = 0.6);
    translate([front_center, 0, rail_z + s1_container_retention_rail_height + 0.1])
      centerline_marks(pocket_l, pocket_w, 0, height = 0.6);
    cg_marker(rail_z + s1_container_retention_rail_height + 0.5, 10);
  }
}

module container_20_twin_adapter_part() {
  if (build_part == "front")
    difference() {
      render(convexity = 10) intersection() { container_20_twin_adapter_full(); split_front_clip(s1_module_length, 70, 70); }
      split_alignment_sockets("front", z = 0.5);
    }
  else if (build_part == "rear")
    difference() {
      render(convexity = 10) intersection() { container_20_twin_adapter_full(); split_rear_clip(s1_module_length, 70, 70); }
      split_alignment_sockets("rear", z = 0.5);
    }
  else
    container_20_twin_adapter_full();
}

container_20_twin_adapter_part();
