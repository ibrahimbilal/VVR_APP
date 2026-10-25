import type { ImageAdjustments } from './screensaverAdjust'
import { adjustmentsAreNeutral, blurSigma } from './screensaverAdjust'

/**
 * CPU/GPU shared slider → shader uniform mapping for the editor color pipeline.
 * Operation order and FFmpeg differences: see shared/screensaverAdjustPipeline.md
 */
export interface AdjustShaderUniforms {
  brightness: number
  contrast: number
  saturation: number
  gain: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  gray: number
  sepia: number
  skipColor: number
  blurSigma: number
  sharpness: number
}

function clampUnit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function adjustShaderUniforms(adjustments: ImageAdjustments, bitmapHeight: number): AdjustShaderUniforms {
  const neutral = adjustmentsAreNeutral(adjustments)
  return {
    brightness: adjustments.brightness / 100,
    contrast: 1 + adjustments.contrast / 100,
    saturation: clampUnit(1 + adjustments.saturation / 100, 0, 3),
    gain: Math.pow(2, adjustments.exposure / 50),
    temperature: adjustments.temperature / 100,
    tint: adjustments.tint / 100,
    highlights: adjustments.highlights / 100,
    shadows: adjustments.shadows / 100,
    gray: clampUnit(adjustments.grayscale / 100, 0, 1),
    sepia: clampUnit(adjustments.sepia / 100, 0, 1),
    skipColor: neutral ? 1 : 0,
    blurSigma: blurSigma(adjustments.blur, bitmapHeight),
    sharpness: adjustments.sharpness > 0 ? (adjustments.sharpness / 100) * 1.5 : 0,
  }
}
