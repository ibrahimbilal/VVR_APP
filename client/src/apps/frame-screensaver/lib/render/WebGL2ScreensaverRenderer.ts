import { adjustShaderUniforms } from '@shared/screensaverAdjustUniforms'
import { backgroundBlurSigma, flattenBackground } from '@shared/screensaverComposition'
import { recordWebGlContextLoss } from '../previewMetrics'
import { bindFullscreenQuad, createFramebuffer, createProgram, resizeFramebuffer, type GlFramebuffer } from './glUtils'
import { BLUR_FRAG, CHECKER_FRAG, COLOR_FRAG, CROP_FRAG, SHARPEN_FRAG, SOLID_FRAG, VERTEX_SRC } from './shaders'
import type { ScreensaverRendererOptions } from './rendererOptions'
import type { ScreensaverImageRenderer, ScreensaverRenderInput } from './types'

const PLACEMENT_VERT = `#version 300 es
in vec2 a_uv;
in vec2 a_pos;
uniform vec2 u_canvas;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec2 ndc = (a_pos / u_canvas) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`

const PLACEMENT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
out vec4 outColor;
void main() {
  vec4 c = texture(u_tex, v_uv);
  outColor = vec4(c.rgb, c.a * u_opacity);
}`

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export class WebGL2ScreensaverRenderer implements ScreensaverImageRenderer {
  readonly backend = 'webgl2' as const
  private readonly lifecycle: ScreensaverRendererOptions
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGL2RenderingContext | null = null
  private sourceTex: WebGLTexture | null = null
  private frameTex: WebGLTexture | null = null
  private placement: GlFramebuffer | null = null
  private ping: GlFramebuffer | null = null
  private programs: Record<string, WebGLProgram> = {}
  private pixelWidth = 0
  private pixelHeight = 0
  private uploadGeneration = 0
  private boundLost: ((event: Event) => void) | null = null
  private boundRestored: (() => void) | null = null

  constructor(lifecycle: ScreensaverRendererOptions = {}) {
    this.lifecycle = lifecycle
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false })
    if (!gl) throw new Error('WebGL2 unavailable.')
    this.gl = gl
    this.buildGpuResources()
    this.boundLost = (event) => {
      event.preventDefault()
      recordWebGlContextLoss()
      this.teardownGpuResources()
      this.lifecycle.onContextLost?.()
    }
    this.boundRestored = () => {
      const next = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false })
      if (!next) {
        this.lifecycle.onRestoreFailed?.()
        return
      }
      this.gl = next
      try {
        this.buildGpuResources()
        if (this.pixelWidth > 0 && this.pixelHeight > 0) {
          this.resize(0, 0, this.pixelWidth, this.pixelHeight)
        }
      } catch {
        this.teardownGpuResources()
        this.lifecycle.onRestoreFailed?.()
      }
    }
    canvas.addEventListener('webglcontextlost', this.boundLost)
    canvas.addEventListener('webglcontextrestored', this.boundRestored)
  }

  private buildGpuResources(): void {
    const gl = this.gl
    if (!gl) throw new Error('WebGL2 context missing.')
    this.programs = {
      crop: createProgram(gl, VERTEX_SRC, CROP_FRAG),
      color: createProgram(gl, VERTEX_SRC, COLOR_FRAG),
      blur: createProgram(gl, VERTEX_SRC, BLUR_FRAG),
      sharpen: createProgram(gl, VERTEX_SRC, SHARPEN_FRAG),
      checker: createProgram(gl, VERTEX_SRC, CHECKER_FRAG),
      solid: createProgram(gl, VERTEX_SRC, SOLID_FRAG),
      placement: createProgram(gl, PLACEMENT_VERT, PLACEMENT_FRAG),
    }
    this.sourceTex = gl.createTexture()
    this.frameTex = gl.createTexture()
    for (const tex of [this.sourceTex, this.frameTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    this.placement = null
    this.ping = null
  }

  private teardownGpuResources(): void {
    const gl = this.gl
    if (gl) {
      for (const program of Object.values(this.programs)) gl.deleteProgram(program)
      if (this.sourceTex) gl.deleteTexture(this.sourceTex)
      if (this.frameTex) gl.deleteTexture(this.frameTex)
      if (this.placement) {
        gl.deleteFramebuffer(this.placement.fbo)
        gl.deleteTexture(this.placement.texture)
      }
      if (this.ping) {
        gl.deleteFramebuffer(this.ping.fbo)
        gl.deleteTexture(this.ping.texture)
      }
    }
    this.programs = {}
    this.sourceTex = null
    this.frameTex = null
    this.placement = null
    this.ping = null
    this.gl = null
  }

  resize(_cssWidth: number, _cssHeight: number, pixelWidth: number, pixelHeight: number): void {
    this.pixelWidth = pixelWidth
    this.pixelHeight = pixelHeight
    const gl = this.gl
    if (!gl) return
    if (!this.placement) this.placement = createFramebuffer(gl, 4, 4)
    if (!this.ping) this.ping = createFramebuffer(gl, 4, 4)
    resizeFramebuffer(gl, this.placement, Math.max(2, pixelWidth), Math.max(2, pixelHeight))
    resizeFramebuffer(gl, this.ping, Math.max(2, pixelWidth), Math.max(2, pixelHeight))
  }

  render(input: ScreensaverRenderInput): { bakeMs: number | null; compositeMs: number | null } {
    const gl = this.gl
    const canvas = this.canvas
    if (!gl || !canvas || !this.sourceTex || !this.placement || !this.ping) {
      return { bakeMs: null, compositeMs: null }
    }

    const pw = canvas.width
    const ph = canvas.height
    const compStart = performance.now()
    const hasSource = Boolean(input.source && input.sourceWidth > 0 && input.sourceHeight > 0)

    if (!hasSource) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, pw, ph)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.disable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      const composition = input.composition
      const flat = flattenBackground(composition.background)
      if (composition.background.mode === 'transparent' && !flat.blur) {
        this.drawChecker(gl, pw, ph, input.view)
      } else {
        this.drawSolid(gl, flat.color, pw, ph, input.view)
      }
      if (input.frame && this.frameTex) {
        gl.bindTexture(gl.TEXTURE_2D, this.frameTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.frame as TexImageSource)
        this.drawTexturedRect(gl, 0, 0, pw, ph, this.frameTex, 1, pw, ph, input.view)
      }
      return { bakeMs: null, compositeMs: performance.now() - compStart }
    }

    this.uploadGeneration += 1
    const gen = this.uploadGeneration

    if (input.source && input.sourceWidth > 0 && input.sourceHeight > 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.source as TexImageSource)
      } catch {
        return { bakeMs: null, compositeMs: null }
      }
      if (gen !== this.uploadGeneration) return { bakeMs: null, compositeMs: null }
    }

    gl.viewport(0, 0, pw, ph)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const composition = input.composition
    const placementW = Math.max(2, Math.round(composition.width * pw))
    const placementH = Math.max(2, Math.round(composition.height * ph))
    resizeFramebuffer(gl, this.placement, placementW, placementH)
    resizeFramebuffer(gl, this.ping, placementW, placementH)

    const crop = composition.crop
    this.runPass(gl, this.programs.crop, this.placement, () => {
      this.bindTex0(gl, this.programs.crop, this.sourceTex!)
      gl.uniform4f(gl.getUniformLocation(this.programs.crop, 'u_crop'), crop.x, crop.y, crop.w, crop.h)
    })

    let processed = this.placement
    if (!input.compareAdjustments) {
      const uniforms = adjustShaderUniforms(composition.adjustments, placementH)
      if (input.previewReducedQuality) uniforms.sharpness = 0
      this.runPass(gl, this.programs.color, this.ping, () => {
        this.bindTex0(gl, this.programs.color, processed.texture)
        this.setColorUniforms(gl, uniforms)
      })
      processed = this.ping
      const sigma =
        uniforms.blurSigma >= 0.2
          ? input.previewReducedQuality
            ? uniforms.blurSigma * 0.65
            : uniforms.blurSigma
          : 0
      if (sigma > 0) {
        const temp = processed === this.placement ? this.ping : this.placement
        this.runBlur(gl, processed, temp, sigma)
      }
      if (uniforms.sharpness > 0 && !input.previewReducedQuality) {
        const out = processed === this.placement ? this.ping : this.placement
        this.runPass(gl, this.programs.sharpen, out, () => {
          this.bindTex0(gl, this.programs.sharpen, processed.texture)
          gl.uniform2f(gl.getUniformLocation(this.programs.sharpen, 'u_texel'), 1 / placementW, 1 / placementH)
          gl.uniform1f(gl.getUniformLocation(this.programs.sharpen, 'u_amount'), uniforms.sharpness)
        })
        processed = out
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, pw, ph)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const flat = flattenBackground(composition.background)
    if (composition.background.mode === 'transparent' && !flat.blur) {
      this.drawChecker(gl, pw, ph, input.view)
    } else if (flat.blur && input.source) {
      this.drawBlurredBackground(gl, input, pw, ph, input.view)
    } else {
      this.drawSolid(gl, flat.color, pw, ph, input.view)
    }

    this.drawPlacement(gl, input, processed.texture, placementW, placementH, pw, ph)

    if (input.frame && this.frameTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.frameTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.frame as TexImageSource)
      this.drawTexturedRect(gl, 0, 0, pw, ph, this.frameTex, 1, pw, ph, input.view)
    }

    const compositeMs = performance.now() - compStart
    return { bakeMs: null, compositeMs }
  }

  dispose(): void {
    if (this.canvas && this.boundLost) this.canvas.removeEventListener('webglcontextlost', this.boundLost)
    if (this.canvas && this.boundRestored) this.canvas.removeEventListener('webglcontextrestored', this.boundRestored)
    this.boundLost = null
    this.boundRestored = null
    this.teardownGpuResources()
    this.canvas = null
  }

  private runPass(gl: WebGL2RenderingContext, program: WebGLProgram, target: GlFramebuffer, uniforms: () => void): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.width, target.height)
    gl.useProgram(program)
    bindFullscreenQuad(gl, program)
    uniforms()
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private runBlur(gl: WebGL2RenderingContext, src: GlFramebuffer, dst: GlFramebuffer, sigma: number): void {
    this.runPass(gl, this.programs.blur, dst, () => {
      this.bindTex0(gl, this.programs.blur, src.texture)
      gl.uniform2f(gl.getUniformLocation(this.programs.blur, 'u_texel'), 1 / src.width, 1 / src.height)
      gl.uniform1f(gl.getUniformLocation(this.programs.blur, 'u_sigma'), sigma)
      gl.uniform1i(gl.getUniformLocation(this.programs.blur, 'u_horizontal'), 1)
    })
    this.runPass(gl, this.programs.blur, src, () => {
      this.bindTex0(gl, this.programs.blur, dst.texture)
      gl.uniform2f(gl.getUniformLocation(this.programs.blur, 'u_texel'), 1 / dst.width, 1 / dst.height)
      gl.uniform1f(gl.getUniformLocation(this.programs.blur, 'u_sigma'), sigma)
      gl.uniform1i(gl.getUniformLocation(this.programs.blur, 'u_horizontal'), 0)
    })
  }

  private bindTex0(gl: WebGL2RenderingContext, program: WebGLProgram, texture: WebGLTexture): void {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0)
  }

  private setColorUniforms(gl: WebGL2RenderingContext, u: ReturnType<typeof adjustShaderUniforms>): void {
    const program = this.programs.color
    gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), u.brightness)
    gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), u.contrast)
    gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), u.saturation)
    gl.uniform1f(gl.getUniformLocation(program, 'u_gain'), u.gain)
    gl.uniform1f(gl.getUniformLocation(program, 'u_temperature'), u.temperature)
    gl.uniform1f(gl.getUniformLocation(program, 'u_tint'), u.tint)
    gl.uniform1f(gl.getUniformLocation(program, 'u_highlights'), u.highlights)
    gl.uniform1f(gl.getUniformLocation(program, 'u_shadows'), u.shadows)
    gl.uniform1f(gl.getUniformLocation(program, 'u_gray'), u.gray)
    gl.uniform1f(gl.getUniformLocation(program, 'u_sepia'), u.sepia)
    gl.uniform1f(gl.getUniformLocation(program, 'u_skip'), u.skipColor)
  }

  private applyView(x: number, y: number, w: number, h: number, pw: number, ph: number, view: ScreensaverRenderInput['view']): [number, number, number, number] {
    const cx = pw / 2
    const cy = ph / 2
    const transform = (px: number, py: number) => {
      const nx = (px - cx) * view.zoom + cx + view.panX * pw
      const ny = (py - cy) * view.zoom + cy + view.panY * ph
      return [nx, ny] as const
    }
    const [x0, y0] = transform(x, y)
    const [x1, y1] = transform(x + w, y + h)
    return [x0, y0, x1 - x0, y1 - y0]
  }

  private drawChecker(gl: WebGL2RenderingContext, pw: number, ph: number, view: ScreensaverRenderInput['view']): void {
    const [x, y, w, h] = this.applyView(0, 0, pw, ph, pw, ph, view)
    gl.useProgram(this.programs.checker)
    bindFullscreenQuad(gl, this.programs.checker)
    gl.uniform2f(gl.getUniformLocation(this.programs.checker, 'u_size'), pw / 40, ph / 40)
    gl.viewport(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.viewport(0, 0, pw, ph)
  }

  private drawSolid(gl: WebGL2RenderingContext, color: string, pw: number, ph: number, view: ScreensaverRenderInput['view']): void {
    const rgb = hexToRgb(color.startsWith('#') ? color : '#000000')
    const [x, y, w, h] = this.applyView(0, 0, pw, ph, pw, ph, view)
    gl.useProgram(this.programs.solid)
    bindFullscreenQuad(gl, this.programs.solid)
    gl.uniform3f(gl.getUniformLocation(this.programs.solid, 'u_color'), rgb[0], rgb[1], rgb[2])
    gl.viewport(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.viewport(0, 0, pw, ph)
  }

  private drawBlurredBackground(gl: WebGL2RenderingContext, input: ScreensaverRenderInput, pw: number, ph: number, view: ScreensaverRenderInput['view']): void {
    void backgroundBlurSigma(input.composition.background.blur)
    const scale = Math.max(pw / input.sourceWidth, ph / input.sourceHeight)
    const dw = input.sourceWidth * scale
    const dh = input.sourceHeight * scale
    const x = (pw - dw) / 2
    const y = (ph - dh) / 2
    const [vx, vy, vw, vh] = this.applyView(x, y, dw, dh, pw, ph, view)
    this.drawTexturedRect(gl, vx, vy, vw, vh, this.sourceTex!, 1, pw, ph, view)
  }

  private drawPlacement(
    gl: WebGL2RenderingContext,
    input: ScreensaverRenderInput,
    texture: WebGLTexture,
    placementW: number,
    placementH: number,
    pw: number,
    ph: number,
  ): void {
    const c = input.composition
    const centerX = (c.x + c.width / 2) * pw
    const centerY = (c.y + c.height / 2) * ph
    const rad = (c.rotation * Math.PI) / 180
    const hw = (placementW / 2) * (c.flipH ? -1 : 1)
    const hh = (placementH / 2) * (c.flipV ? -1 : 1)
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [-hw, hh],
      [hw, hh],
    ].map(([lx, ly]) => {
      const rx = lx * Math.cos(rad) - ly * Math.sin(rad)
      const ry = lx * Math.sin(rad) + ly * Math.cos(rad)
      return [centerX + rx, centerY + ry] as const
    })
    const uvs = [
      [0, 1],
      [1, 1],
      [0, 0],
      [1, 0],
    ]
    if (c.flipH) uvs.forEach((uv) => (uv[0] = 1 - uv[0]))
    if (c.flipV) uvs.forEach((uv) => (uv[1] = 1 - uv[1]))

    const program = this.programs.placement
    gl.useProgram(program)
    const locPos = gl.getAttribLocation(program, 'a_pos')
    const locUv = gl.getAttribLocation(program, 'a_uv')
    const buffer = gl.createBuffer()
    const data = new Float32Array(16)
    for (let i = 0; i < 4; i++) {
      const [px, py] = this.applyViewPoint(corners[i][0], corners[i][1], pw, ph, input.view)
      data[i * 4] = uvs[i][0]
      data[i * 4 + 1] = uvs[i][1]
      data[i * 4 + 2] = px
      data[i * 4 + 3] = py
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(locUv)
    gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(locPos)
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 16, 8)
    gl.uniform2f(gl.getUniformLocation(program, 'u_canvas'), pw, ph)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0)
    gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), c.opacity)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private applyViewPoint(px: number, py: number, pw: number, ph: number, view: ScreensaverRenderInput['view']): [number, number] {
    const cx = pw / 2
    const cy = ph / 2
    return [(px - cx) * view.zoom + cx + view.panX * pw, (py - cy) * view.zoom + cy + view.panY * ph]
  }

  private drawTexturedRect(
    gl: WebGL2RenderingContext,
    x: number,
    y: number,
    w: number,
    h: number,
    texture: WebGLTexture,
    opacity: number,
    pw: number,
    ph: number,
    view: ScreensaverRenderInput['view'],
  ): void {
    const program = this.programs.placement
    gl.useProgram(program)
    const corners = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ].map(([px, py]) => this.applyViewPoint(px, py, pw, ph, view))
    const uvs = [[0, 1], [1, 1], [0, 0], [1, 0]]
    const buffer = gl.createBuffer()
    const data = new Float32Array(16)
    for (let i = 0; i < 4; i++) {
      data[i * 4] = uvs[i][0]
      data[i * 4 + 1] = uvs[i][1]
      data[i * 4 + 2] = corners[i][0]
      data[i * 4 + 3] = corners[i][1]
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    const locPos = gl.getAttribLocation(program, 'a_pos')
    const locUv = gl.getAttribLocation(program, 'a_uv')
    gl.enableVertexAttribArray(locUv)
    gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(locPos)
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 16, 8)
    gl.uniform2f(gl.getUniformLocation(program, 'u_canvas'), pw, ph)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0)
    gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}
