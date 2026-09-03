#version 300 es

// Vertex buffer YOK. gl_VertexID'den üç köşe üretiyoruz:
// 0 -> (-1,-1)   1 -> (3,-1)   2 -> (-1,3)
// Bu üçgen NDC karesini tamamen örter, artan kısmı donanım kırpar.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
