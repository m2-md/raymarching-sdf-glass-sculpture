#version 300 es

// NO vertex buffer. We generate three vertices from gl_VertexID:
// 0 -> (-1,-1)   1 -> (3,-1)   2 -> (-1,3)
// This triangle completely covers the NDC quad; excess is clipped by hardware.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
