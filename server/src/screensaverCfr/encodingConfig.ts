import {
  SCREENSAVER_CFR_TIMESCALE,
  type ScreensaverCfrQuality,
} from '../../../shared/screensaver'
import { encoderArgs, type EncoderId } from '../encoders'
import { x264Params, x264Threads } from '../ffmpegThreading'

export interface CfrEncodeSettings {
  quality: ScreensaverCfrQuality
  fps: number
  width: number
  height: number
  timescale: number
  gopSeconds: number
  gopFrames: number
  bFrames: number
  crf: number
  preset: string
  level: string
  profile: string
  stillTune: boolean
  engineVersion: string
}

/** Bump when encoded segment bytes are no longer compatible with older cache entries. */
export const CFR_ENGINE_VERSION = '1'

export function resolveCfrEncodeSettings(
  quality: ScreensaverCfrQuality,
  fps: number,
  width: number,
  height: number,
): CfrEncodeSettings {
  const gopSeconds = quality === 'compact' ? 5 : 2
  const gopFrames = Math.max(1, Math.round(fps * gopSeconds))
  const crf = quality === 'high' ? 18 : quality === 'compact' ? 24 : 20
  const preset = quality === 'high' ? 'medium' : 'veryfast'
  return {
    quality,
    fps,
    width,
    height,
    timescale: SCREENSAVER_CFR_TIMESCALE,
    gopSeconds,
    gopFrames,
    bFrames: 2,
    crf,
    preset,
    level: h264Level(width, height, fps),
    profile: 'high',
    stillTune: true,
    engineVersion: CFR_ENGINE_VERSION,
  }
}

/**
 * Pick an H.264 level that covers the configuration.
 * 5.2 is reserved for 4K60-class; lower resolutions use a matching level.
 */
export function h264Level(width: number, height: number, fps: number): string {
  // Macroblock throughput vs H.264 level MaxMBPS caps.
  const mbPerSec = Math.ceil(width / 16) * Math.ceil(height / 16) * fps
  if (mbPerSec > 983_040 || (width >= 3840 && fps >= 50)) return '5.2'
  if (mbPerSec > 589_824 || width >= 3840) return '5.1'
  if (mbPerSec > 522_240 || width >= 2560) return '5.0'
  if (mbPerSec > 245_760) return '4.2'
  return '4.0'
}

/**
 * libx264 args compatible across every segment in one concat.
 * Static segments may use stillimage tune; dynamic segments must not,
 * but share profile/level/GOP/color so stream-copy stays valid.
 */
export function cfrLibx264Args(settings: CfrEncodeSettings, still: boolean): string[] {
  const gop = settings.gopFrames
  const params = [
    x264Params(x264Threads()),
    'open-gop=0',
    'repeat-headers=1',
    `keyint=${gop}`,
    `min-keyint=${gop}`,
    'scenecut=0',
    `bframes=${settings.bFrames}`,
    'ref=3',
    'force-cfr=1',
  ].join(':')

  const args = [
    '-c:v',
    'libx264',
    '-preset',
    settings.preset,
    '-crf',
    String(settings.crf),
    '-pix_fmt',
    'yuv420p',
    '-threads',
    String(x264Threads()),
  ]
  if (still && settings.stillTune) args.push('-tune', 'stillimage')
  args.push(
    '-x264-params',
    params,
    '-profile:v',
    settings.profile,
    '-level:v',
    settings.level,
    '-g',
    String(gop),
    '-keyint_min',
    String(gop),
    '-sc_threshold',
    '0',
    '-bf',
    String(settings.bFrames),
    '-flags',
    '+cgop',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
    '-fps_mode',
    'cfr',
    '-r',
    String(settings.fps),
    '-video_track_timescale',
    String(settings.timescale),
  )
  return args
}

/**
 * When Auto/hardware is selected, fall back to the shared encoderArgs for the tier
 * but still force CFR-compatible mux flags. Hardware path is best-effort; CFR validation
 * may reject incompatible segments and the caller should use libx264.
 */
export function cfrHardwareArgs(id: EncoderId, settings: CfrEncodeSettings, still: boolean): string[] {
  const tier = settings.quality === 'high' ? 'high' : 'standard'
  const base = encoderArgs(id, tier, still)
  return [
    ...base,
    '-fps_mode',
    'cfr',
    '-r',
    String(settings.fps),
    '-video_track_timescale',
    String(settings.timescale),
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
  ]
}

export function cacheKeyParts(settings: CfrEncodeSettings, still: boolean, frameCount: number): Record<string, string | number | boolean> {
  return {
    engine: settings.engineVersion,
    quality: settings.quality,
    fps: settings.fps,
    width: settings.width,
    height: settings.height,
    timescale: settings.timescale,
    gop: settings.gopFrames,
    bFrames: settings.bFrames,
    crf: settings.crf,
    preset: settings.preset,
    level: settings.level,
    profile: settings.profile,
    stillTune: still && settings.stillTune,
    frameCount,
  }
}
