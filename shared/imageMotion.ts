import { FRAME_RATES, OUTPUTS, even, isAllowedFps, isAllowedOutput } from './frame'
import { isEncoderChoice, type EncoderChoice } from './screensaver'

export const MAX_IMAGE_MOTION_SEGMENTS = 30
export const MAX_SEQUENCE_SECONDS = 30 * 60
export const DEFAULT_SEGMENT_DURATION = 10
export const DEFAULT_SLOW_TRAVEL = 0.3
export const DEFAULT_CROSSFADE = 0.5
export const PREVIEW_CACHE_LONG_EDGE = 1080

export type ImageMotionMode = 'full' | 'slow'
export type PanDirection = 'rtl' | 'ltr'
export type MotionEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
export type SegmentTransition = 'cut' | 'fade'

export interface ImageMotionSettings {
  mode: ImageMotionMode
  direction: PanDirection
  easing: MotionEasing
  duration: number
  travelDistance: number
  startPosition: number
  zoom: number
}

export interface SegmentTransitionSettings {
  type: SegmentTransition
  fadeDuration: number
}

export interface ImageMotionVideoSettings {
  width: number
  height: number
  fps: number
  encoder: EncoderChoice
}

export interface ImageMotionAudioSettings {
  musicVolume: number
  musicFadeIn: number
  musicFadeOut: number
  musicOffset: number
  loopMusic: boolean
}

export interface ImageMotionSegment {
  id: string
  fileName: string
  width: number
  height: number
  serverId: string | null
  duration: number
  motion: ImageMotionSettings
  transitionAfter: SegmentTransitionSettings
}

export interface ImageMotionProject {
  version: 1
  name: string
  segments: ImageMotionSegment[]
  video: ImageMotionVideoSettings
  audio: ImageMotionAudioSettings
}

export interface CoverGeometry {
  scale: number
  scaledWidth: number
  scaledHeight: number
  horizontalOverflow: number
  verticalOverflow: number
  offsetY: number
}

export interface CropRect {
  sourceX: number
  sourceY: number
  sourceW: number
  sourceH: number
}

export function defaultMotionSettings(mode: ImageMotionMode = 'full'): ImageMotionSettings {
  return {
    mode,
    direction: 'ltr',
    easing: mode === 'full' ? 'linear' : 'easeInOut',
    duration: DEFAULT_SEGMENT_DURATION,
    travelDistance: DEFAULT_SLOW_TRAVEL,
    startPosition: 0,
    zoom: 1,
  }
}

export function defaultTransitionAfter(): SegmentTransitionSettings {
  return { type: 'fade', fadeDuration: DEFAULT_CROSSFADE }
}

export function defaultImageMotionProject(): ImageMotionProject {
  const output = OUTPUTS[0]
  return {
    version: 1,
    name: 'Untitled image motion',
    segments: [],
    video: {
      width: output.width,
      height: output.height,
      fps: 30,
      encoder: 'cpu',
    },
    audio: {
      musicVolume: 0.35,
      musicFadeIn: 0.5,
      musicFadeOut: 1,
      musicOffset: 0,
      loopMusic: true,
    },
  }
}

export function normalizeMotionSettings(input: Partial<ImageMotionSettings> | null | undefined): ImageMotionSettings {
  const mode: ImageMotionMode = input?.mode === 'slow' ? 'slow' : 'full'
  const base = defaultMotionSettings(mode)
  const direction: PanDirection = input?.direction === 'ltr' ? 'ltr' : 'rtl'
  const easing = normalizeEasing(input?.easing, base.easing)
  let duration = Number(input?.duration)
  if (!Number.isFinite(duration) || duration < 0.3) duration = DEFAULT_SEGMENT_DURATION
  duration = Math.min(600, Math.round(duration * 1000) / 1000)
  let travelDistance = Number(input?.travelDistance)
  if (!Number.isFinite(travelDistance)) travelDistance = DEFAULT_SLOW_TRAVEL
  travelDistance = Math.min(1, Math.max(0.01, travelDistance))
  let startPosition = Number(input?.startPosition)
  if (!Number.isFinite(startPosition)) startPosition = 0
  startPosition = Math.min(1, Math.max(0, startPosition))
  let zoom = Number(input?.zoom)
  if (!Number.isFinite(zoom) || zoom < 1) zoom = 1
  zoom = Math.min(3, Math.round(zoom * 1000) / 1000)
  return {
    mode,
    direction,
    easing,
    duration,
    travelDistance,
    startPosition,
    zoom,
  }
}

function normalizeEasing(value: unknown, fallback: MotionEasing): MotionEasing {
  if (value === 'linear' || value === 'easeIn' || value === 'easeOut' || value === 'easeInOut') return value
  return fallback
}

export function normalizeTransitionAfter(input: Partial<SegmentTransitionSettings> | null | undefined): SegmentTransitionSettings {
  const type: SegmentTransition = input?.type === 'fade' ? 'fade' : 'cut'
  let fadeDuration = Number(input?.fadeDuration)
  if (!Number.isFinite(fadeDuration) || fadeDuration <= 0) fadeDuration = DEFAULT_CROSSFADE
  fadeDuration = Math.min(3, Math.max(0.1, Math.round(fadeDuration * 1000) / 1000))
  return { type, fadeDuration }
}

export function computeCoverGeometry(
  imageWidth: number,
  imageHeight: number,
  outputWidth: number,
  outputHeight: number,
  zoom: number,
): CoverGeometry {
  const iw = Math.max(1, imageWidth)
  const ih = Math.max(1, imageHeight)
  const ow = Math.max(1, outputWidth)
  const oh = Math.max(1, outputHeight)
  const z = Math.max(1, zoom)
  const scale = Math.max(ow / iw, oh / ih) * z
  const scaledWidth = iw * scale
  const scaledHeight = ih * scale
  const horizontalOverflow = Math.max(0, scaledWidth - ow)
  const verticalOverflow = Math.max(0, scaledHeight - oh)
  const offsetY = verticalOverflow > 0 ? verticalOverflow / 2 : 0
  return { scale, scaledWidth, scaledHeight, horizontalOverflow, verticalOverflow, offsetY }
}

export function applyEasing(t: number, easing: MotionEasing): number {
  const clamped = Math.min(1, Math.max(0, t))
  switch (easing) {
    case 'easeIn':
      return clamped * clamped
    case 'easeOut':
      return 1 - (1 - clamped) * (1 - clamped)
    case 'easeInOut': {
      if (clamped < 0.5) return 2 * clamped * clamped
      return 1 - Math.pow(-2 * clamped + 2, 2) / 2
    }
    default:
      return clamped
  }
}

/** Horizontal crop offset in scaled-image space (0 = show left edge of scaled image). */
export function offsetXAtProgress(
  geometry: CoverGeometry,
  motion: Pick<ImageMotionSettings, 'mode' | 'direction' | 'travelDistance' | 'startPosition'>,
  progress: number,
  easedProgress?: number,
): number {
  const t = easedProgress ?? progress
  const overflow = geometry.horizontalOverflow
  if (overflow <= 1e-6) {
    return 0
  }

  let start = 0
  let end = 0

  if (motion.mode === 'full') {
    if (motion.direction === 'rtl') {
      start = overflow
      end = 0
    } else {
      start = 0
      end = overflow
    }
  } else {
    const travel = overflow * Math.min(1, Math.max(0.01, motion.travelDistance))
    const span = Math.max(0, overflow - travel)
    const pos = Math.min(1, Math.max(0, motion.startPosition))
    if (motion.direction === 'rtl') {
      start = overflow - pos * span
      end = start - travel
    } else {
      start = pos * span
      end = start + travel
    }
    end = Math.min(overflow, Math.max(0, end))
    start = Math.min(overflow, Math.max(0, start))
  }

  return start + (end - start) * t
}

export function cropAtProgress(
  imageWidth: number,
  imageHeight: number,
  outputWidth: number,
  outputHeight: number,
  motion: ImageMotionSettings,
  progress: number,
): CropRect {
  const geometry = computeCoverGeometry(imageWidth, imageHeight, outputWidth, outputHeight, motion.zoom)
  const eased = applyEasing(progress, motion.easing)
  const offsetX = offsetXAtProgress(geometry, motion, progress, eased)
  const offsetY = geometry.offsetY

  const sourceX = offsetX / geometry.scale
  const sourceY = offsetY / geometry.scale
  const sourceW = outputWidth / geometry.scale
  const sourceH = outputHeight / geometry.scale

  const maxX = Math.max(0, imageWidth - sourceW)
  const maxY = Math.max(0, imageHeight - sourceH)
  return {
    sourceX: Math.min(maxX, Math.max(0, sourceX)),
    sourceY: Math.min(maxY, Math.max(0, sourceY)),
    sourceW: Math.min(imageWidth, sourceW),
    sourceH: Math.min(imageHeight, sourceH),
  }
}

export function cropAtFrame(
  imageWidth: number,
  imageHeight: number,
  outputWidth: number,
  outputHeight: number,
  motion: ImageMotionSettings,
  frameIndex: number,
  fps: number,
): CropRect {
  const totalFrames = Math.max(1, Math.round(motion.duration * fps))
  const progress = frameIndex / Math.max(1, totalFrames - 1)
  return cropAtProgress(imageWidth, imageHeight, outputWidth, outputHeight, motion, progress)
}

export function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  outputWidth: number,
  outputHeight: number,
  motion: ImageMotionSettings,
  progress: number,
): void {
  const crop = cropAtProgress(imageWidth, imageHeight, outputWidth, outputHeight, motion, progress)
  ctx.drawImage(
    image,
    crop.sourceX,
    crop.sourceY,
    crop.sourceW,
    crop.sourceH,
    0,
    0,
    outputWidth,
    outputHeight,
  )
}

/** FFmpeg crop filter after scale=cover dimensions (uses `n` as frame index). */
export function ffmpegMotionFilterChain(
  inputLabel: string,
  imageWidth: number,
  imageHeight: number,
  outputWidth: number,
  outputHeight: number,
  motion: ImageMotionSettings,
  fps: number,
): string {
  const geometry = computeCoverGeometry(imageWidth, imageHeight, outputWidth, outputHeight, motion.zoom)
  const sw = even(Math.ceil(geometry.scaledWidth))
  const sh = even(Math.ceil(geometry.scaledHeight))
  const ow = even(outputWidth)
  const oh = even(outputHeight)
  const overflow = geometry.horizontalOverflow
  const offsetY = even(Math.round(geometry.offsetY))

  const scale = `[${inputLabel}]scale=${sw}:${sh}[ims]`

  if (overflow <= 1e-6) {
    const x = even(Math.round((sw - ow) / 2))
    return `${scale};[ims]crop=${ow}:${oh}:${x}:${offsetY},fps=${fps}[v]`
  }

  const totalFrames = Math.max(1, Math.round(motion.duration * fps))
  const denom = Math.max(1, totalFrames - 1)

  let start: number
  let end: number
  if (motion.mode === 'full') {
    if (motion.direction === 'rtl') {
      start = overflow
      end = 0
    } else {
      start = 0
      end = overflow
    }
  } else {
    const travel = overflow * Math.min(1, Math.max(0.01, motion.travelDistance))
    const span = Math.max(0, overflow - travel)
    const pos = Math.min(1, Math.max(0, motion.startPosition))
    if (motion.direction === 'rtl') {
      start = overflow - pos * span
      end = start - travel
    } else {
      start = pos * span
      end = start + travel
    }
    end = Math.min(overflow, Math.max(0, end))
    start = Math.min(overflow, Math.max(0, start))
  }

  const easedExpr = ffmpegEasedProgressExpr(motion.easing, `n/${denom}`)
  const xExpr = `${start}+(${end}-${start})*(${easedExpr})`
  const crop = `[ims]crop=${ow}:${oh}:x='${xExpr}':y=${offsetY},fps=${fps}[v]`
  return `${scale};${crop}`
}

function ffmpegEasedProgressExpr(easing: MotionEasing, tExpr: string): string {
  const t = `min(1,max(0,${tExpr}))`
  switch (easing) {
    case 'easeIn':
      return `(${t})*(${t})`
    case 'easeOut':
      return `1-(1-(${t}))*(1-(${t}))`
    case 'easeInOut':
      return `if(lt(${t},0.5),2*(${t})*(${t}),1-pow(-2*(${t})+2,2)/2)`
    default:
      return t
  }
}

export function validateImageMotionVideo(video: ImageMotionVideoSettings): string | null {
  if (!isAllowedOutput(video.width, video.height)) return 'Output must be 1080×1920 or 720×1280.'
  if (!isAllowedFps(video.fps)) return 'Frame rate must be 24, 30, or 60.'
  return null
}

export function normalizeImageMotionProject(raw: Partial<ImageMotionProject>): ImageMotionProject {
  const defaults = defaultImageMotionProject()
  const video = raw.video ?? defaults.video
  const width = isAllowedOutput(video.width, video.height) ? video.width : defaults.video.width
  const height = isAllowedOutput(video.width, video.height) ? video.height : defaults.video.height
  const fps = FRAME_RATES.includes(video.fps as (typeof FRAME_RATES)[number]) ? video.fps : defaults.video.fps
  const encoder = isEncoderChoice(video.encoder) ? video.encoder : defaults.video.encoder
  return {
    version: 1,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : defaults.name,
    segments: Array.isArray(raw.segments) ? raw.segments.map(normalizeSegment).slice(0, MAX_IMAGE_MOTION_SEGMENTS) : [],
    video: { width, height, fps, encoder },
    audio: {
      musicVolume: clamp01(raw.audio?.musicVolume, defaults.audio.musicVolume),
      musicFadeIn: clampNonNeg(raw.audio?.musicFadeIn, defaults.audio.musicFadeIn, 30),
      musicFadeOut: clampNonNeg(raw.audio?.musicFadeOut, defaults.audio.musicFadeOut, 30),
      musicOffset: clampNonNeg(raw.audio?.musicOffset, defaults.audio.musicOffset, 600),
      loopMusic: raw.audio?.loopMusic !== false,
    },
  }
}

function normalizeSegment(raw: Partial<ImageMotionSegment>): ImageMotionSegment {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : '',
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    width: Math.max(0, Number(raw.width) || 0),
    height: Math.max(0, Number(raw.height) || 0),
    serverId: typeof raw.serverId === 'string' ? raw.serverId : null,
    duration: normalizeMotionSettings({ duration: raw.duration }).duration,
    motion: normalizeMotionSettings(raw.motion),
    transitionAfter: normalizeTransitionAfter(raw.transitionAfter),
  }
}

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000))
}

function clampNonNeg(value: unknown, fallback: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(max, Math.round(n * 1000) / 1000)
}
