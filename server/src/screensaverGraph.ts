import { ffmpegAdjustmentFilter } from '../../shared/screensaverAdjust'
import {
  backgroundBlurSigma,
  flattenBackground,
  isPlainFullFrame,
  type ScreensaverComposition,
} from '../../shared/screensaverComposition'
import { ffColor, n } from './ffmpegUtil'

export interface GraphJob {
  mediaKind: 'image' | 'video'
  mode: 'static' | 'loop'
  width: number
  height: number
  fps: number
  duration: number
  fit: 'contain' | 'cover' | 'blur'
  loopType: 'hard' | 'smooth'
  backgroundColor: string
  sourceWidth: number
  sourceHeight: number
  sourceCodec: string | null
  sourcePixFmt: string | null
  composition: ScreensaverComposition | null
  compositionPath: string | null
  framePath: string | null
  maskPath: string | null
}

export function canStreamCopy(job: GraphJob): boolean {
  if (job.mode !== 'loop' || job.loopType !== 'hard' || job.mediaKind !== 'video') return false
  if (job.compositionPath || job.framePath || job.maskPath) return false
  if (job.sourceCodec !== 'h264' || job.sourcePixFmt !== 'yuv420p') return false
  if (job.sourceWidth !== job.width || job.sourceHeight !== job.height) return false
  if (job.composition) return isPlainFullFrame(job.composition)
  return job.fit !== 'blur'
}

export function legacyScaleFilter(width: number, height: number, fit: 'contain' | 'cover' | 'blur', backgroundColor: string): string {
  const bg = ffColor(backgroundColor)
  if (fit === 'cover') {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
  }
  if (fit === 'blur') {
    return `split=2[fg][bg];[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=24[bb];[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[ff];[bb][ff]overlay=(W-w)/2:(H-h)/2`
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${bg}`
}

export function compositionFilterLines(input: {
  composition: ScreensaverComposition
  inputLabel: string
  outputLabel: string
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
  fps: number
  duration: number
  maskIndex: number | null
  frameIndex: number | null
}): string[] {
  const lines: string[] = []
  const flat = flattenBackground(input.composition.background)
  if (flat.blur) {
    const sigma = backgroundBlurSigma(input.composition.background.blur).toFixed(3)
    lines.push(
      `[${input.inputLabel}]scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},gblur=sigma=${sigma},format=yuv420p[bg]`,
    )
  } else {
    lines.push(`color=c=${ffColor(flat.color)}:s=${input.width}x${input.height}:r=${input.fps},format=yuv420p[bg]`)
  }

  const crop = input.composition.crop
  const sw = evenWithin(crop.w * input.sourceWidth, input.sourceWidth)
  const sh = evenWithin(crop.h * input.sourceHeight, input.sourceHeight)
  const sx = clampInt(Math.round(crop.x * input.sourceWidth), 0, Math.max(0, input.sourceWidth - sw))
  const sy = clampInt(Math.round(crop.y * input.sourceHeight), 0, Math.max(0, input.sourceHeight - sh))
  const pw = even(input.composition.width * input.width)
  const ph = even(input.composition.height * input.height)
  const px = Math.round(input.composition.x * input.width)
  const py = Math.round(input.composition.y * input.height)
  const chain = [`crop=${sw}:${sh}:${sx}:${sy}`]
  if (input.composition.flipH) chain.push('hflip')
  if (input.composition.flipV) chain.push('vflip')
  const adjust = ffmpegAdjustmentFilter(input.composition.adjustments, ph)
  if (adjust) chain.push(adjust)
  chain.push(`scale=${pw}:${ph}:flags=lanczos`)
  let overlayX = px
  let overlayY = py
  if (Math.abs(input.composition.rotation) > 0.05) {
    const rad = ((input.composition.rotation * Math.PI) / 180).toFixed(5)
    chain.push(`rotate=${rad}:ow=rotw(${rad}):oh=roth(${rad}):c=none`)
    const radians = (input.composition.rotation * Math.PI) / 180
    const rotW = Math.abs(pw * Math.cos(radians)) + Math.abs(ph * Math.sin(radians))
    const rotH = Math.abs(pw * Math.sin(radians)) + Math.abs(ph * Math.cos(radians))
    overlayX = Math.round(px + pw / 2 - rotW / 2)
    overlayY = Math.round(py + ph / 2 - rotH / 2)
  }
  chain.push('format=rgba')
  if (input.composition.opacity < 0.999) chain.push(`colorchannelmixer=aa=${input.composition.opacity.toFixed(3)}`)
  lines.push(`[${input.inputLabel}]${chain.join(',')}[fg]`)

  let picture = 'based'
  if (input.maskIndex != null) {
    lines.push(`color=c=black@0.0:s=${input.width}x${input.height}:r=${input.fps},format=rgba[clear]`)
    lines.push(`[clear][fg]overlay=${overlayX}:${overlayY}:format=auto[placed]`)
    lines.push(`[${input.maskIndex}:v]scale=${input.width}:${input.height},format=gray[mask]`)
    lines.push(`[placed][mask]alphamerge[clipped]`)
    lines.push(`[bg][clipped]overlay=0:0:format=auto[${picture}]`)
  } else {
    lines.push(`[bg][fg]overlay=${overlayX}:${overlayY}:format=auto[${picture}]`)
  }
  if (input.frameIndex != null) {
    lines.push(`[${input.frameIndex}:v]scale=${input.width}:${input.height},format=rgba[fr]`)
    lines.push(`[${picture}][fr]overlay=0:0:format=auto[framed]`)
    picture = 'framed'
  }
  lines.push(`[${picture}]format=yuv420p,fps=${input.fps},trim=0:${n(input.duration)},setpts=PTS-STARTPTS[${input.outputLabel}]`)
  return lines
}

export function audioFilterLine(input: {
  inputLabel: string
  volume: number
  fadeIn: number
  fadeOut: number
  duration: number
  loopSamples: boolean
}): string {
  const parts = [
    'aresample=48000',
    'aformat=sample_fmts=fltp:channel_layouts=stereo',
    `volume=${n(input.volume)}`,
  ]
  if (input.loopSamples) parts.push('aloop=loop=-1:size=2e+09')
  parts.push(`atrim=0:${n(input.duration)}`, 'asetpts=PTS-STARTPTS')
  if (input.fadeIn > 0.01) parts.push(`afade=t=in:st=0:d=${n(input.fadeIn)}`)
  if (input.fadeOut > 0.01) {
    parts.push(`afade=t=out:st=${n(Math.max(0, input.duration - input.fadeOut))}:d=${n(input.fadeOut)}`)
  }
  return `[${input.inputLabel}]${parts.join(',')}[aout]`
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded + 1
}

function evenWithin(value: number, max: number): number {
  const limit = Math.max(2, Math.floor(max))
  let rounded = Math.min(limit, Math.max(2, Math.round(value)))
  if (rounded % 2) rounded -= 1
  if (rounded > limit) rounded = limit % 2 === 0 ? limit : limit - 1
  return Math.max(2, rounded)
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
