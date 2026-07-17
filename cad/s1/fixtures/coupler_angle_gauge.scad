include <../s1_parameters.scad>

module tick(angle, length = 12, width = 1.2) {
  rotate([0, 0, angle])
    translate([64, -width / 2, 3])
      cube([length, width, 2]);
}

module coupler_angle_gauge() {
  difference() {
    union() {
      cylinder(h = 4, r = 82);
      translate([0, 0, 4])
        cylinder(h = 2, r = 8);
      for (a = [-18 : 3 : 18])
        tick(a, length = (a == -15 || a == 0 || a == 15) ? 18 : 10);
      rotate([0, 0, -s1_coupler_yaw_normal_deg])
        translate([48, -1.5, 5])
          cube([42, 3, 3]);
      rotate([0, 0, s1_coupler_yaw_normal_deg])
        translate([48, -1.5, 5])
          cube([42, 3, 3]);
    }
    translate([0, 0, -1])
      cylinder(h = 8, r = 54);
    translate([-90, -90, -1])
      cube([180, 90, 8]);
    translate([0, 0, -1])
      cylinder(h = 10, r = s1_coupler_pivot_diameter / 2 + s1_printer_tolerance);
  }
}

coupler_angle_gauge();

