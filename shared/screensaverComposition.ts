import { defaultAdjustments, type ImageAdjustments, adjustmentsAreNeutral } from './screensaverAdjust'
import { framePreset, isFrameId, type FrameId } from './screensaverFrames'
import type { ScreensaverFit } from './screensaver'

export type { ImageAdjustments } from './screensaverAdjust'
export type { FrameId } from './screensaverFrames'

export type CropAspect = 'free' | '16:9' | '4:3' | '3:2' | '1:1' | 'original' | 'custom'
export type BackgroundMode = 'color' | 'blur' | 'transparent' | 'black' | 'white'

export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ScreensaverBackground {
  mode: BackgroundMode
  color: string
  blur: number
}

export interface ScreensaverComposition {
  crop: CropRect
  cropAspect: CropAspect
  customAspectW: number
  customAspectH: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
  opacity: number
  adjustments: ImageAdjustments
  background: ScreensaverBackground
  frameId: FrameId
}

export const CROP_ASPECTS: { id: CropAspect; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: 'original', label: 'Original', ratio: null },
  { id: 'custom', label: 'Custom', ratio: null },
]

export function fullCrop(): CropRect {
  return { x: 0, y: 0, w: 1, h: 1 }
}

export function defaultComposition(): ScreensaverComposition {
  return {
    crop: fullCrop(),
    cropAspect: 'free',
    customAspectW: 16,
    customAspectH: 9,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
    adjustments: defaultAdjustments(),
    background: { mode: 'color', color: '#000000', blur: 100 },
    frameId: 'none',
  }
}

export function croppedPixelSize(sourceWidth: number, sourceHeight: number, crop: CropRect): { width: number; height: number } {
  return {
    width: Math.max(1, crop.w * Math.max(1, sourceWidth)),
    height: Math.max(1, crop.h * Math.max(1, sourceHeight)),
  }
}

export function placementForFit(
  fit: 'contain' | 'cover',
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  crop: CropRect = fullCrop(),
): { x: number; y: number; width: number; height: number } {
  const source = croppedPixelSize(sourceWidth, sourceHeight, crop)
  const outW = Math.max(1, outputWidth)
  const outH = Math.max(1, outputHeight)
  const scale =
    fit === 'cover'
      ? Math.max(outW / source.width, outH / source.height)
      : Math.min(outW / source.width, outH / source.height)
  const width = (source.width * scale) / outW
  const height = (source.height * scale) / outH
  return {
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  }
}

export function compositionForFit(
  fit: ScreensaverFit,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  backgroundColor = '#000000',
): ScreensaverComposition {
  const base = defaultComposition()
  const placement = placementForFit(fit === 'cover' ? 'cover' : 'contain', sourceWidth, sourceHeight, outputWidth, outputHeight)
  return {
    ...base,
    ...placement,
    background: {
      mode: fit === 'blur' ? 'blur' : 'color',
      color: backgroundColor,
      blur: 100,
    },
  }
}

export function aspectRatio(aspect: CropAspect, sourceWidth: number, sourceHeight: number, customW: number, customH: number): number | null {
  if (aspect === 'free') return null
  if (aspect === 'original') return sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : null
  if (aspect === 'custom') return customW > 0 && customH > 0 ? customW / customH : null
  return CROP_ASPECTS.find((item) => item.id === aspect)?.ratio ?? null
}

/** Largest centered crop of the requested aspect inside the source. */
export function cropForAspect(ratio: number | null): CropRect {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return fullCrop()
  if (ratio >= 1) {
    const h = Math.min(1, 1 / ratio)
    return { x: 0, y: (1 - h) / 2, w: 1, h }
  }
  const w = Math.min(1, ratio)
  return { x: (1 - w) / 2, y: 0, w, h: 1 }
}

export function clampComposition(value: ScreensaverComposition): ScreensaverComposition {
  const crop = clampCrop(value.crop)
  const background = value.background
  return {
    ...value,
    crop,
    cropAspect: isCropAspect(value.cropAspect) ? value.cropAspect : 'free',
    customAspectW: clampNumber(value.customAspectW, 1, 100, 16),
    customAspectH: clampNumber(value.customAspectH, 1, 100, 9),
    x: clampNumber(value.x, -2, 2, 0),
    y: clampNumber(value.y, -2, 2, 0),
    width: clampNumber(value.width, 0.02, 8, 1),
    height: clampNumber(value.height, 0.02, 8, 1),
    rotation: clampNumber(value.rotation, -180, 180, 0),
    flipH: Boolean(value.flipH),
    flipV: Boolean(value.flipV),
    opacity: clampNumber(value.opacity, 0, 1, 1),
    adjustments: clampAdjustments(value.adjustments),
    background: {
      mode: isBackgroundMode(background?.mode) ? background.mode : 'color',
      color: isHex(background?.color) ? background.color : '#000000',
      blur: clampNumber(background?.blur, 0, 100, 100),
    },
    frameId: isFrameId(value.frameId) ? value.frameId : 'none',
  }
}

export function sanitizeComposition(raw: unknown): ScreensaverComposition | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ScreensaverComposition>
  if (!data.crop || typeof data.crop !== 'object') return null
  try {
    return clampComposition({
      ...defaultComposition(),
      ...data,
      crop: { ...fullCrop(), ...data.crop },
      adjustments: { ...defaultAdjustments(), ...(data.adjustments ?? {}) },
      background: { ...defaultComposition().background, ...(data.background ?? {}) },
    })
  } catch {
    return null
  }
}

export function flattenBackground(background: ScreensaverBackground): { color: string; blur: boolean } {
  if (background.mode === 'white') return { color: '#ffffff', blur: false }
  if (background.mode === 'black') return { color: '#000000', blur: false }
  if (background.mode === 'blur') return { color: background.color || '#000000', blur: true }
  return { color: background.color || '#000000', blur: false }
}

export function backgroundBlurSigma(blur: number): number {
  return Math.max(0.4, (Math.max(0, Math.min(100, blur)) / 100) * 24)
}

/** True when a matching H.264 source can be copied without a filter graph. */
export function isPlainFullFrame(composition: ScreensaverComposition): boolean {
  const preset = framePreset(composition.frameId)
  if (preset.id !== 'none') return false
  if (!cropIsFull(composition.crop)) return false
  if (Math.abs(composition.rotation) > 0.1) return false
  if (composition.flipH || composition.flipV) return false
  if (composition.opacity < 0.999) return false
  if (!adjustmentsAreNeutral(composition.adjustments)) return false
  if (composition.background.mode === 'blur') return false
  const covers =
    composition.x <= 0.01 &&
    composition.y <= 0.01 &&
    composition.x + composition.width >= 0.99 &&
    composition.y + composition.height >= 0.99
  return covers
}

export function cropIsFull(crop: CropRect): boolean {
  return crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999
}

export function compositionsEqual(a: ScreensaverComposition, b: ScreensaverComposition): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function clampCrop(crop: CropRect): CropRect {
  const w = clampNumber(crop?.w, 0.02, 1, 1)
  const h = clampNumber(crop?.h, 0.02, 1, 1)
  const x = clampNumber(crop?.x, 0, 1 - w, 0)
  const y = clampNumber(crop?.y, 0, 1 - h, 0)
  return { x, y, w, h }
}

function clampAdjustments(value: ImageAdjustments | undefined): ImageAdjustments {
  const base = defaultAdjustments()
  const source = value ?? base
  for (const key of Object.keys(base) as (keyof ImageAdjustments)[]) {
    const max = key === 'sharpness' || key === 'blur' || key === 'grayscale' || key === 'sepia' ? 100 : 100
    const min = key === 'sharpness' || key === 'blur' || key === 'grayscale' || key === 'sepia' ? 0 : -100
    base[key] = clampNumber(source[key], min, max, 0)
  }
  return base
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function isCropAspect(value: unknown): value is CropAspect {
  return value === 'free' || value === '16:9' || value === '4:3' || value === '3:2' || value === '1:1' || value === 'original' || value === 'custom'
}

function isBackgroundMode(value: unknown): value is BackgroundMode {
  return value === 'color' || value === 'blur' || value === 'transparent' || value === 'black' || value === 'white'
}
