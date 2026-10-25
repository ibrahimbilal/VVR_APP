import { QUAD_VERT } from './glUtils'

/** Color pipeline order matches shared/screensaverAdjust.ts applyColorAdjustments. */
export const COLOR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_gain;
uniform float u_temperature;
uniform float u_tint;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_gray;
uniform float u_sepia;
uniform float u_skip;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 src = texture(u_tex, v_uv);
  if (u_skip > 0.5) {
    outColor = src;
    return;
  }
  vec3 c = src.rgb * u_gain;
  c += vec3(u_brightness);
  c = (c - 0.5) * u_contrast + 0.5;
  float L = luma(c);
  if (u_shadows != 0.0 && L < 0.5) {
    float lift = u_shadows * (0.5 - L) * 0.85;
    c += vec3(lift);
  }
  if (u_highlights != 0.0 && L > 0.5) {
    float roll = u_highlights * (L - 0.5) * 0.85;
    c += vec3(roll);
  }
  c.r += u_temperature * 0.18;
  c.b -= u_temperature * 0.18;
  c.g += u_tint * 0.12;
  L = luma(c);
  c = vec3(L) + (c - vec3(L)) * u_saturation;
  float L2 = luma(c);
  if (u_gray > 0.0) c = mix(c, vec3(L2), u_gray);
  if (u_sepia > 0.0) {
    vec3 sep = vec3(
      dot(c, vec3(0.393, 0.769, 0.189)),
      dot(c, vec3(0.349, 0.686, 0.168)),
      dot(c, vec3(0.272, 0.534, 0.131))
    );
    c = mix(c, sep, u_sepia);
  }
  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`

export const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_sigma;
uniform int u_horizontal;
out vec4 outColor;

void main() {
  if (u_sigma < 0.01) {
    outColor = texture(u_tex, v_uv);
    return;
  }
  float w0 = exp(-0.5 * 0.0);
  float w1 = exp(-0.5 * 1.0);
  float w2 = exp(-0.5 * 4.0);
  float norm = w0 + 2.0 * (w1 + w2);
  vec4 sum = texture(u_tex, v_uv) * w0;
  vec2 dir = u_horizontal > 0 ? vec2(u_texel.x, 0.0) : vec2(0.0, u_texel.y);
  sum += texture(u_tex, v_uv + dir) * w1;
  sum += texture(u_tex, v_uv - dir) * w1;
  sum += texture(u_tex, v_uv + dir * 2.0) * w2;
  sum += texture(u_tex, v_uv - dir * 2.0) * w2;
  outColor = sum / norm;
}`

export const SHARPEN_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_amount;
out vec4 outColor;

void main() {
  if (u_amount <= 0.0) {
    outColor = texture(u_tex, v_uv);
    return;
  }
  vec4 c = texture(u_tex, v_uv);
  vec4 b = (
    texture(u_tex, v_uv + vec2(u_texel.x, 0.0)) +
    texture(u_tex, v_uv - vec2(u_texel.x, 0.0)) +
    texture(u_tex, v_uv + vec2(0.0, u_texel.y)) +
    texture(u_tex, v_uv - vec2(0.0, u_texel.y))
  ) * 0.25;
  vec3 rgb = c.rgb + u_amount * (c.rgb - b.rgb);
  outColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`

export const CROP_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec4 u_crop;
out vec4 outColor;
void main() {
  vec2 uv = mix(u_crop.xy, u_crop.xy + u_crop.zw, v_uv);
  outColor = texture(u_tex, uv);
}`

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
out vec4 outColor;
void main() {
  outColor = texture(u_scene, v_uv);
}`

export const CHECKER_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_size;
out vec4 outColor;
void main() {
  vec2 p = floor(v_uv * u_size);
  float c = mod(p.x + p.y, 2.0);
  vec3 dark = vec3(0.101961, 0.109804, 0.129412);
  vec3 light = vec3(0.164706, 0.176471, 0.203922);
  outColor = vec4(mix(dark, light, c), 1.0);
}`

export const SOLID_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec3 u_color;
out vec4 outColor;
void main() { outColor = vec4(u_color, 1.0); }`

export const VERTEX_SRC = QUAD_VERT
