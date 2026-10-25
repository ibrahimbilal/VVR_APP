export interface ImageAdjustments {
  brightness: number
  contrast: number
  saturation: number
  exposure: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  sharpness: number
  blur: number
  grayscale: number
  sepia: number
}

export const ADJUSTMENT_FIELDS = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 100 },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
] as const satisfies readonly { key: keyof ImageAdjustments; label: string; min: number; max: number }[]

export function defaultAdjustments(): ImageAdjustments {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    sharpness: 0,
    blur: 0,
    grayscale: 0,
    sepia: 0,
  }
}

export function adjustmentsAreNeutral(adjustments: ImageAdjustments): boolean {
  return ADJUSTMENT_FIELDS.every((field) => Math.abs(adjustments[field.key]) < 0.01)
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clampUnit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Sigma for a blur slider at a given bitmap height. Shared by the canvas bake and FFmpeg gblur. */
export function blurSigma(blur: number, bitmapHeight: number): number {
  if (blur <= 0 || bitmapHeight <= 0) return 0
  return (blur / 100) * bitmapHeight * 0.012
}

/**
 * Color pipeline used by the editor bake. Static exports rasterize this result.
 * Video exports use ffmpegAdjustmentFilter with the same slider mapping.
 * Canonical order and cross-backend notes: shared/screensaverAdjustPipeline.md
 */
export function applyColorAdjustments(data: Uint8ClampedArray, adjustments: ImageAdjustments): void {
  if (adjustmentsAreNeutral(adjustments)) return
  const brightness = adjustments.brightness / 100
  const contrast = 1 + adjustments.contrast / 100
  const saturation = clampUnit(1 + adjustments.saturation / 100, 0, 3)
  const gain = Math.pow(2, adjustments.exposure / 50)
  const temperature = adjustments.temperature / 100
  const tint = adjustments.tint / 100
  const highlights = adjustments.highlights / 100
  const shadows = adjustments.shadows / 100
  const gray = clampUnit(adjustments.grayscale / 100, 0, 1)
  const sepia = clampUnit(adjustments.sepia / 100, 0, 1)

  for (let index = 0; index < data.length; index += 4) {
    let r = (data[index] / 255) * gain
    let g = (data[index + 1] / 255) * gain
    let b = (data[index + 2] / 255) * gain
    r += brightness
    g += brightness
    b += brightness
    r = (r - 0.5) * contrast + 0.5
    g = (g - 0.5) * contrast + 0.5
    b = (b - 0.5) * contrast + 0.5
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722
    if (shadows !== 0 && luma < 0.5) {
      const lift = shadows * (0.5 - luma) * 0.85
      r += lift
      g += lift
      b += lift
    }
    if (highlights !== 0 && luma > 0.5) {
      const roll = highlights * (luma - 0.5) * 0.85
      r += roll
      g += roll
      b += roll
    }
    r += temperature * 0.18
    b -= temperature * 0.18
    g += tint * 0.12
    r = luma + (r - luma) * saturation
    g = luma + (g - luma) * saturation
    b = luma + (b - luma) * saturation
    const luma2 = r * 0.2126 + g * 0.7152 + b * 0.0722
    if (gray > 0) {
      r += (luma2 - r) * gray
      g += (luma2 - g) * gray
      b += (luma2 - b) * gray
    }
    if (sepia > 0) {
      const sr = r * 0.393 + g * 0.769 + b * 0.189
      const sg = r * 0.349 + g * 0.686 + b * 0.168
      const sb = r * 0.272 + g * 0.534 + b * 0.131
      r += (sr - r) * sepia
      g += (sg - g) * sepia
      b += (sb - b) * sepia
    }
    data[index] = clampChannel(r * 255)
    data[index + 1] = clampChannel(g * 255)
    data[index + 2] = clampChannel(b * 255)
  }
}

export function applyBoxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const r = Math.round(radius)
  if (r < 1 || width < 2 || height < 2) return
  const src = new Uint8ClampedArray(data)
  const tmp = new Uint8ClampedArray(data.length)
  blurAxis(src, tmp, width, height, r, true)
  blurAxis(tmp, data, width, height, r, false)
}

export function applyUnsharp(data: Uint8ClampedArray, width: number, height: number, sharpness: number): void {
  if (sharpness <= 0) return
  const blurred = new Uint8ClampedArray(data)
  applyBoxBlur(blurred, width, height, 1)
  const amount = (sharpness / 100) * 1.5
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const offset = index + channel
      const next = data[offset] + amount * (data[offset] - blurred[offset])
      data[offset] = clampChannel(next)
    }
  }
}

function blurAxis(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  const window = radius * 2 + 1
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0
        for (let kx = -radius; kx <= radius; kx++) sum += src[(y * width + clampIndex(kx, width)) * 4 + channel]
        for (let x = 0; x < width; x++) {
          dst[(y * width + x) * 4 + channel] = clampChannel(sum / window)
          const remove = x - radius
          const add = x + radius + 1
          sum -= src[(y * width + clampIndex(remove, width)) * 4 + channel]
          sum += src[(y * width + clampIndex(add, width)) * 4 + channel]
        }
      }
      for (let x = 0; x < width; x++) dst[(y * width + x) * 4 + 3] = src[(y * width + x) * 4 + 3]
    }
    return
  }
  for (let x = 0; x < width; x++) {
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0
      for (let ky = -radius; ky <= radius; ky++) sum += src[(clampIndex(ky, height) * width + x) * 4 + channel]
      for (let y = 0; y < height; y++) {
        dst[(y * width + x) * 4 + channel] = clampChannel(sum / window)
        const remove = y - radius
        const add = y + radius + 1
        sum -= src[(clampIndex(remove, height) * width + x) * 4 + channel]
        sum += src[(clampIndex(add, height) * width + x) * 4 + channel]
      }
    }
    for (let y = 0; y < height; y++) dst[(y * width + x) * 4 + 3] = src[(y * width + x) * 4 + 3]
  }
}

function clampIndex(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value))
}

/** FFmpeg filters for the same slider values. Empty when every slider is neutral. */
export function ffmpegAdjustmentFilter(adjustments: ImageAdjustments, bitmapHeight: number): string {
  if (adjustmentsAreNeutral(adjustments)) return ''
  const parts: string[] = []
  const brightness = (adjustments.brightness / 100).toFixed(3)
  const contrast = clampUnit(1 + adjustments.contrast / 100, 0, 2).toFixed(3)
  const saturation = clampUnit(1 + adjustments.saturation / 100, 0, 3).toFixed(3)
  if (adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0) {
    parts.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`)
  }
  if (adjustments.exposure !== 0) parts.push(`exposure=exposure=${(adjustments.exposure / 50).toFixed(3)}`)
  if (adjustments.shadows !== 0 || adjustments.highlights !== 0) {
    const shadowY = clampUnit(0.25 + (adjustments.shadows / 100) * 0.2, 0.02, 0.7).toFixed(3)
    const highY = clampUnit(0.75 + (adjustments.highlights / 100) * 0.2, 0.3, 0.98).toFixed(3)
    parts.push(`curves=all='0/0 0.25/${shadowY} 0.75/${highY} 1/1'`)
  }
  if (adjustments.temperature !== 0 || adjustments.tint !== 0) {
    const rs = clampUnit(adjustments.temperature / 200, -1, 1).toFixed(3)
    const bs = clampUnit(-adjustments.temperature / 200, -1, 1).toFixed(3)
    const gm = clampUnit(adjustments.tint / 200, -1, 1).toFixed(3)
    parts.push(`colorbalance=rs=${rs}:bs=${bs}:gm=${gm}`)
  }
  if (adjustments.grayscale > 0) parts.push(`hue=s=${clampUnit(1 - adjustments.grayscale / 100, 0, 1).toFixed(3)}`)
  if (adjustments.sepia > 0) {
    const p = clampUnit(adjustments.sepia / 100, 0, 1)
    const mix = (identity: number, sepiaValue: number) => (identity + (sepiaValue - identity) * p).toFixed(3)
    parts.push(
      `colorchannelmixer=${mix(1, 0.393)}:${mix(0, 0.769)}:${mix(0, 0.189)}:0:${mix(0, 0.349)}:${mix(1, 0.686)}:${mix(0, 0.168)}:0:${mix(0, 0.272)}:${mix(0, 0.534)}:${mix(1, 0.131)}`,
    )
  }
  const sigma = blurSigma(adjustments.blur, bitmapHeight)
  if (sigma >= 0.2) parts.push(`gblur=sigma=${sigma.toFixed(3)}`)
  if (adjustments.sharpness > 0) parts.push(`unsharp=5:5:${((adjustments.sharpness / 100) * 1.5).toFixed(3)}`)
  return parts.join(',')
}
