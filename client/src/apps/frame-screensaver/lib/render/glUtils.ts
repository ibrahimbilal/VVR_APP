export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader error'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

export function linkProgram(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Could not create program.')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown link error'
    gl.deleteProgram(program)
    throw new Error(log)
  }
  return program
}

export function createProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc)
  return linkProgram(gl, vs, fs)
}

export interface GlFramebuffer {
  fbo: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

export function createFramebuffer(gl: WebGL2RenderingContext, width: number, height: number): GlFramebuffer {
  const texture = gl.createTexture()
  const fbo = gl.createFramebuffer()
  if (!texture || !fbo) throw new Error('Could not create framebuffer.')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, texture, width, height }
}

export function resizeFramebuffer(gl: WebGL2RenderingContext, target: GlFramebuffer, width: number, height: number): void {
  if (target.width === width && target.height === height) return
  target.width = width
  target.height = height
  gl.bindTexture(gl.TEXTURE_2D, target.texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
}

const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

export function bindFullscreenQuad(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  const loc = gl.getAttribLocation(program, 'a_pos')
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
}

export { QUAD_VERT }
