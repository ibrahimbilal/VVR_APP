export const SCREENSAVER_OUTPUTS = [
  { width: 1920, height: 1080, label: '1920 × 1080 (Full HD)' },
  { width: 2560, height: 1440, label: '2560 × 1440 (QHD)' },
  { width: 3840, height: 2160, label: '3840 × 2160 (4K UHD)' },
] as const

export const SCREENSAVER_FPS = [1, 24, 30] as const

export const SCREENSAVER_PROFILES = [
  { id: 'static-fast', label: 'Static Art', detail: 'One precomposed image, 1 fps, same H.264 quality band as Balanced.' },
  { id: 'balanced', label: 'Balanced', detail: 'General use. CRF 20 on CPU, equivalent CQ on a verified hardware encoder.' },
  { id: 'high', label: 'High quality', detail: 'CRF 16 on CPU, or a slower hardware preset at a lower CQ.' },
  { id: 'animated', label: 'Animated', detail: 'Motion frame rate and video looping. Hardware only when a timed test is faster.' },
] as const

export type ScreensaverProfile = (typeof SCREENSAVER_PROFILES)[number]['id']

export const ENCODER_CHOICES = ['auto', 'cpu', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox', 'h264_mf'] as const

export type EncoderChoice = (typeof ENCODER_CHOICES)[number]

export const DURATION_PRESETS = [
  { label: '30 minutes', seconds: 30 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '2 hours', seconds: 2 * 60 * 60 },
  { label: '4 hours', seconds: 4 * 60 * 60 },
  { label: '6 hours', seconds: 6 * 60 * 60 },
  { label: '8 hours', seconds: 8 * 60 * 60 },
  { label: '10 hours', seconds: 10 * 60 * 60 },
] as const

export const DEFAULT_DURATION_SECONDS = 60 * 60
export const MIN_DURATION_SECONDS = 30 * 60
export const MAX_DURATION_SECONDS = 10 * 60 * 60

/** Server test script only — not accepted from normal API clients unless env allows. */
export const TEST_MIN_DURATION_SECONDS = 5

export type ScreensaverFit = 'contain' | 'cover' | 'blur'
export type ScreensaverMode = 'static' | 'loop'
export type ScreensaverLoop = 'hard' | 'smooth'
export type ScreensaverAudioMode = 'none' | 'source' | 'upload'

export function isAllowedScreensaverOutput(width: number, height: number): boolean {
  return SCREENSAVER_OUTPUTS.some((output) => output.width === width && output.height === height)
}

export function isAllowedScreensaverFps(fps: number): boolean {
  return fps === 1 || fps === 24 || fps === 30
}

export function isScreensaverProfile(value: unknown): value is ScreensaverProfile {
  return value === 'static-fast' || value === 'balanced' || value === 'high' || value === 'animated'
}

export function isEncoderChoice(value: unknown): value is EncoderChoice {
  return typeof value === 'string' && (ENCODER_CHOICES as readonly string[]).includes(value)
}

export function profileFps(profile: ScreensaverProfile): number {
  if (profile === 'static-fast') return 1
  if (profile === 'balanced') return 24
  return 30
}

export function profileQualityTier(profile: ScreensaverProfile): 'standard' | 'high' {
  return profile === 'high' ? 'high' : 'standard'
}

export function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_DURATION_SECONDS
  return Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, seconds))
}

export function formatDurationLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h} hour${h === 1 ? '' : 's'}`
  return `${m} minutes`
}

/**
 * Approximate file size in bytes.
 * Still and motion rates at 1920×1080, and the still rate at 3840×2160, come from the
 * 8-second libx264 CRF 20 baseline on 2026-10-22 (see PROJECT.md). Other sizes scale
 * those 1080p bytes/sec by pixel count. This is an extrapolation, not a guarantee.
 * Audio adds 192 kbit/s when a track is present.
 */
export function estimateOutputBytes(
  width: number,
  height: number,
  durationSec: number,
  hasAudio: boolean,
  kind: 'still' | 'motion' = 'motion',
): number {
  const pixels = Math.max(1, width * height)
  const fullHd = 1920 * 1080
  const still1080 = 48156 / 8
  const still4k = 120820 / 8
  const motion1080 = 313403 / 8
  let videoPerSecond = kind === 'motion' ? motion1080 * (pixels / fullHd) : still1080 * (pixels / fullHd)
  if (kind === 'still' && pixels >= 3840 * 2160 * 0.9) videoPerSecond = still4k
  const audioPerSecond = hasAudio ? 192_000 / 8 : 0
  return Math.round((videoPerSecond + audioPerSecond) * Math.max(0, durationSec))
}
