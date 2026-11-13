export const SCREENSAVER_OUTPUTS = [
  { width: 1920, height: 1080, label: '1920 × 1080 (Full HD)' },
  { width: 2560, height: 1440, label: '2560 × 1440 (QHD)' },
  { width: 3840, height: 2160, label: '3840 × 2160 (4K UHD)' },
] as const

/** Default output for new / reset Screensaver projects. */
export const DEFAULT_SCREENSAVER_OUTPUT =
  SCREENSAVER_OUTPUTS.find((output) => output.width === 3840 && output.height === 2160) ??
  SCREENSAVER_OUTPUTS[SCREENSAVER_OUTPUTS.length - 1]

export const SCREENSAVER_FPS = [1, 24, 30, 60] as const

/** Frame rates allowed when Optimized CFR is selected. */
export const SCREENSAVER_CFR_FPS = [24, 25, 30, 50, 60] as const

export const DEFAULT_CFR_FPS = 60

export const SCREENSAVER_RENDER_MODES = [
  {
    id: 'optimized-cfr',
    label: 'Optimized CFR',
    recommended: true,
    detail:
      'Produces smooth, constant-frame-rate videos by reusing encoded static segments instead of rendering every frame.',
  },
  {
    id: 'fast-vfr',
    label: 'Fast VFR',
    recommended: false,
    detail:
      'Creates smaller videos using variable frame rates. Animated content may lose smoothness after YouTube processing.',
  },
] as const

export type ScreensaverRenderMode = (typeof SCREENSAVER_RENDER_MODES)[number]['id']

/** Default for newly created Screensaver projects. Saved projects without a mode stay on Fast VFR. */
export const DEFAULT_SCREENSAVER_RENDER_MODE: ScreensaverRenderMode = 'optimized-cfr'

export const SCREENSAVER_CFR_QUALITY_PRESETS = [
  {
    id: 'high',
    label: 'High Quality',
    detail: 'Prioritize preservation of fine artwork details.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    detail: 'Balance visual quality, file size, and encoding performance.',
  },
  {
    id: 'compact',
    label: 'Compact',
    detail: 'Reduce output file size while preserving acceptable visual quality.',
  },
] as const

export type ScreensaverCfrQuality = (typeof SCREENSAVER_CFR_QUALITY_PRESETS)[number]['id']

export const DEFAULT_SCREENSAVER_CFR_QUALITY: ScreensaverCfrQuality = 'balanced'

/** Track timescale that represents every SCREENSAVER_CFR_FPS value exactly. */
export const SCREENSAVER_CFR_TIMESCALE = 60_000

/** Candidate reusable static segment lengths (seconds). Production picks adaptively; UI stays hidden. */
export const SCREENSAVER_CFR_SEGMENT_CANDIDATES_SEC = [2, 5, 10, 30, 60] as const

/** Validated baseline segment length from the Optimized CFR proof of concept. */
export const SCREENSAVER_CFR_DEFAULT_SEGMENT_SEC = 10

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
  { label: '12 hours', seconds: 12 * 60 * 60 },
] as const

export const DEFAULT_DURATION_SECONDS = 4 * 60 * 60
/** Matches `String(DURATION_PRESETS[].seconds)` for the default duration preset button. */
export const DEFAULT_DURATION_PRESET_KEY = String(DEFAULT_DURATION_SECONDS)
export const MIN_DURATION_SECONDS = 60
export const MAX_DURATION_SECONDS = 12 * 60 * 60

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
  return (SCREENSAVER_FPS as readonly number[]).includes(fps)
}

export function isAllowedScreensaverCfrFps(fps: number): boolean {
  return (SCREENSAVER_CFR_FPS as readonly number[]).includes(fps)
}

export function isScreensaverRenderMode(value: unknown): value is ScreensaverRenderMode {
  return value === 'optimized-cfr' || value === 'fast-vfr'
}

export function isScreensaverCfrQuality(value: unknown): value is ScreensaverCfrQuality {
  return value === 'high' || value === 'balanced' || value === 'compact'
}

/**
 * Fast VFR keeps the legacy fps list. Optimized CFR uses the CFR list.
 * Unknown / missing mode is treated as Fast VFR so older saved projects stay valid.
 */
export function isAllowedScreensaverFpsForMode(fps: number, mode: ScreensaverRenderMode | null | undefined): boolean {
  if (mode === 'optimized-cfr') return isAllowedScreensaverCfrFps(fps)
  return isAllowedScreensaverFps(fps)
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

/** Map CFR quality preset onto the existing encoder tier used by hardware Auto selection. */
export function cfrQualityToEncoderTier(quality: ScreensaverCfrQuality): 'standard' | 'high' {
  return quality === 'high' ? 'high' : 'standard'
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
 * 8-second libx264 CRF 20 baseline on 2026-10-22 (see `.cursor/skills/vvr-project/screensaver.md`). Other sizes scale
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
