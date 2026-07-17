include <../s1_parameters.scad>

module clearance_gauge() {
  union() {
    rounded_box([160, 12, 8], 3);
    translate([-74, 48, 0])
      rounded_box([12, 108, 8], 3);
    translate([74, 48, 0])
      rounded_box([12, 108, 8], 3);
    translate([0, 104, 0])
      rounded_box([160, 12, 8], 3);
    translate([0, 48, 8])
      rounded_box([s1_sled_width + 10, 4, 18], 1.5);
    translate([0, 86, 8])
      rounded_box([s1_sled_width + 20, 4, 28], 1.5);
    translate([0, 48, 28])
      centerline_marks(s1_sled_width + 40, 90, 0, height = 1.0);
  }
}

clearance_gauge();

