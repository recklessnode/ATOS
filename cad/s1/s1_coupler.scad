include <s1_parameters.scad>

build_part = "front";

module pivot_ring() {
  difference() {
    cylinder(h = 6, r = 9);
    translate([0, 0, -1]) cylinder(h = 8, r = s1_coupler_pivot_diameter / 2 + s1_printer_tolerance);
  }
}

module front_coupler() {
  union() {
    translate([0, 0, 3]) pivot_ring();
    translate([s1_coupler_drawbar_length / 2, 0, 0])
      rounded_box([s1_coupler_drawbar_length, 10, 6], 2);
    translate([s1_coupler_drawbar_length + 7, 0, 0])
      rounded_box([14, 16, 6], 2);
    translate([s1_coupler_drawbar_length + 15, 0, 2])
      rotate([0, 90, 0]) cylinder(h = 6, r = 2.2, center = true);
  }
}

module rear_coupler() {
  difference() {
    union() {
      translate([0, 0, 3]) pivot_ring();
      translate([-s1_coupler_drawbar_length / 2, 0, 0])
        rounded_box([s1_coupler_drawbar_length, 10, 6], 2);
      translate([-s1_coupler_drawbar_length - 8, 0, 0])
        rounded_box([18, 20, 6], 2);
    }
    translate([-s1_coupler_drawbar_length - 8, 0, 2])
      rounded_box([20, 8 + 2 * s1_printer_tolerance, 8], 1.5);
    translate([-s1_coupler_drawbar_length - 16, 0, 2])
      rotate([0, 90, 0]) cylinder(h = 8, r = 2.5 + s1_printer_tolerance, center = true);
  }
}

if (build_part == "rear")
  rear_coupler();
else
  front_coupler();

