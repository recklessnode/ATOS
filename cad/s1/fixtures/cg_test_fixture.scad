include <../s1_parameters.scad>

module scale_pad() {
  union() {
    rounded_box([34, 24, 5], 3);
    translate([0, 0, 5])
      cylinder(h = 3, r = 5);
  }
}

module cg_test_fixture() {
  union() {
    rounded_box([s1_support_node_x + 34, 10, 8], 3);
    rounded_box([10, s1_support_node_y + 54, 8], 3);
    support_node_positions()
      translate([0, 0, 8])
        scale_pad();
    translate([0, 0, 11])
      centerline_marks(s1_support_node_x + 30, s1_support_node_y + 44, 0, height = 1.0);
    translate([0, 0, 13])
      datum_cross(size = 24, height = 1.0, width = 1.5);
  }
}

cg_test_fixture();
