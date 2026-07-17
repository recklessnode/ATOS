include <../s1_parameters.scad>

module clearance_gauge() {
  platform_gap = 10;
  vehicle_clearance = s1_stabilization_envelope_width + 8;
  station_clearance = s1_module_width + 14;
  total_height = s1_deck_height_above_g0 + s1_overnight_pod_height + s1_module_interface_height + 6;
  union() {
    rounded_box([130, 10, 7], 2.5);
    translate([-60, 44, 0])
      rounded_box([10, 98, 7], 2.5);
    translate([60, 44, 0])
      rounded_box([10, 98, 7], 2.5);
    translate([0, 93, 0])
      rounded_box([130, 10, 7], 2.5);
    translate([0, platform_gap + vehicle_clearance / 2, 7])
      rounded_box([vehicle_clearance, 3, s1_deck_height_above_g0 + 8], 1.2);
    translate([0, 56, 7])
      rounded_box([station_clearance, 3, total_height], 1.2);
    translate([0, 44, total_height + 7])
      centerline_marks(station_clearance + 24, 76, 0, height = 0.9);
  }
}

clearance_gauge();
