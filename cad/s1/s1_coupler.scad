include <s1_parameters.scad>

build_part = "front";

module pivot_ring() {
  difference() {
    cylinder(h = 5, r = 7);
    translate([0, 0, -1]) cylinder(h = 7, r = s1_coupler_pivot_diameter / 2 + s1_printer_tolerance);
  }
}

module front_coupler() {
  union() {
    translate([0, 0, 2.5]) pivot_ring();
    translate([s1_coupler_drawbar_length / 2, 0, 0])
      rounded_box([s1_coupler_drawbar_length, 7, 5], 1.6);
    translate([s1_coupler_drawbar_length + 5.5, 0, 0])
      rounded_box([11, 12, 5], 1.6);
    translate([s1_coupler_drawbar_length + 12, 0, 1.8])
      rotate([0, 90, 0]) cylinder(h = 5, r = 1.9, center = true);
  }
}

module rear_coupler() {
  difference() {
    union() {
      translate([0, 0, 2.5]) pivot_ring();
      translate([-s1_coupler_drawbar_length / 2, 0, 0])
        rounded_box([s1_coupler_drawbar_length, 7, 5], 1.6);
      translate([-s1_coupler_drawbar_length - 6, 0, 0])
        rounded_box([14, 15, 5], 1.6);
    }
    translate([-s1_coupler_drawbar_length - 6, 0, 1.8])
      rounded_box([16, 6 + 2 * s1_printer_tolerance, 7], 1.3);
    translate([-s1_coupler_drawbar_length - 13, 0, 1.8])
      rotate([0, 90, 0]) cylinder(h = 6, r = 2.2 + s1_printer_tolerance, center = true);
  }
}

if (build_part == "rear")
  rear_coupler();
else
  front_coupler();
