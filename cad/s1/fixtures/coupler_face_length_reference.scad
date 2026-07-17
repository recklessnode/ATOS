include <../s1_parameters.scad>
use <../s1_sled.scad>
use <../s1_coupler.scad>

module coupler_face_length_reference() {
  union() {
    s1_sled_part();
    translate([s1_coupler_pivot_spacing / 2, 0, s1_sled_height / 2])
      front_coupler();
    translate([-s1_coupler_pivot_spacing / 2, 0, s1_sled_height / 2])
      rear_coupler();
  }
}

coupler_face_length_reference();
