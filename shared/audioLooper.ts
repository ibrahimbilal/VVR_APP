/** Audio Looper contract shared by the editor and the renderer. */

export const AUDIO_LOOPER_FORMATS = ['mp3', 'wav', 'flac'] as const
export type AudioLooperFormat = (typeof AUDIO_LOOPER_FORMATS)[number]

export const AUDIO_LOOPER_IMPORT_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] as const
export type AudioLooperImportExtension = (typeof AUDIO_LOOPER_IMPORT_EXTENSIONS)[number]

export const AUDIO_LOOPER_LOOP_MODES = ['simple', 'seamless'] as const
export type AudioLooperLoopMode = (typeof AUDIO_LOOPER_LOOP_MODES)[number]

export const AUDIO_LOOPER_BITRATES = [128, 192, 256, 320] as const
export type AudioLooperBitrate = (typeof AUDIO_LOOPER_BITRATES)[number]

/** Real equal-power cycle engine is implemented in renderAudioLooper.ts. */
export const SEAMLESS_AVAILABLE = true

export const AUDIO_LOOPER_DURATION_PRESETS = [
  { label: '30 minutes', seconds: 30 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '2 hours', seconds: 2 * 60 * 60 },
  { label: '4 hours', seconds: 4 * 60 * 60 },
  { label: '6 hours', seconds: 6 * 60 * 60 },
  { label: '8 hours', seconds: 8 * 60 * 60 },
  { label: '10 hours', seconds: 10 * 60 * 60 },
  { label: '12 hours', seconds: 12 * 60 * 60 },
] as const

export const DEFAULT_DURATION_SECONDS = 2 * 60 * 60
export const MIN_DURATION_SECONDS = 60
export const MAX_DURATION_SECONDS = 12 * 60 * 60
/** Server test script only — not accepted from normal API clients unless env allows. */
export const TEST_MIN_DURATION_SECONDS = 1

export const MIN_CROSSFADE_SECONDS = 0.01
export const MAX_CROSSFADE_SECONDS = 5
export const DEFAULT_CROSSFADE_SECONDS = 0.25
export const CROSSFADE_SOURCE_RATIO = 0.5

export const MIN_FADE_SECONDS = 0
export const MAX_FADE_SECONDS = 30

export const MIN_VOLUME_PERCENT = 0
export const MAX_VOLUME_PERCENT = 200
export const DEFAULT_VOLUME_PERCENT = 100

export const DEFAULT_MP3_BITRATE = 192

export interface AudioLooperLimits {
  maxFileBytes: number
}

export const DEFAULT_AUDIO_LOOPER_LIMITS: AudioLooperLimits = {
  maxFileBytes: 100 * 1024 * 1024,
}

export interface AudioLooperSettings {
  targetDurationSeconds: number
  loopMode: AudioLooperLoopMode
  crossfadeSeconds: number
  fadeInSeconds: number
  fadeOutSeconds: number
  volumePercent: number
  format: AudioLooperFormat
  mp3Bitrate: AudioLooperBitrate
  filename: string
}

export interface AudioLooperNormalizeContext {
  sourceDuration?: number
  minDurationSeconds?: number
  maxFileBytes?: number
}

export function defaultAudioLooperSettings(): AudioLooperSettings {
  return {
    targetDurationSeconds: DEFAULT_DURATION_SECONDS,
    loopMode: 'simple',
    crossfadeSeconds: DEFAULT_CROSSFADE_SECONDS,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    volumePercent: DEFAULT_VOLUME_PERCENT,
    format: 'mp3',
    mp3Bitrate: DEFAULT_MP3_BITRATE,
    filename: 'loop',
  }
}

export function isAudioLooperFormat(value: unknown): value is AudioLooperFormat {
  return value === 'mp3' || value === 'wav' || value === 'flac'
}

export function isAudioLooperLoopMode(value: unknown): value is AudioLooperLoopMode {
  return value === 'simple' || value === 'seamless'
}

export function isAudioLooperBitrate(value: unknown): value is AudioLooperBitrate {
  return value === 128 || value === 192 || value === 256 || value === 320
}

export function outputExtension(format: AudioLooperFormat): '.mp3' | '.wav' | '.flac' {
  if (format === 'wav') return '.wav'
  if (format === 'flac') return '.flac'
  return '.mp3'
}

export function contentTypeForFormat(format: AudioLooperFormat): string {
  if (format === 'wav') return 'audio/wav'
  if (format === 'flac') return 'audio/flac'
  return 'audio/mpeg'
}

export function importExtension(name: string): AudioLooperImportExtension | null {
  const ext = name.split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase() ?? ''
  if ((AUDIO_LOOPER_IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    return ext as AudioLooperImportExtension
  }
  return null
}

export function maxCrossfadeForSource(sourceDuration: number): number {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return MIN_CROSSFADE_SECONDS
  const relative = sourceDuration * CROSSFADE_SOURCE_RATIO
  const strict = sourceDuration - 1e-3
  return Math.max(MIN_CROSSFADE_SECONDS, Math.min(MAX_CROSSFADE_SECONDS, relative, strict))
}

export function sanitizeLooperStem(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? 'loop'
  const stem = base.replace(/\.[^.]+$/, '')
  const cleaned = stem
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 60)
  return cleaned || 'loop'
}

export function audioLooperDownloadName(stem: string, format: AudioLooperFormat): string {
  return `${sanitizeLooperStem(stem)}${outputExtension(format)}`
}

export function splitDuration(totalSeconds: number): { hours: number; minutes: number; seconds: number } {
  const whole = clampInt(totalSeconds, 0, MAX_DURATION_SECONDS)
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
  }
}

export function combineDuration(hours: number, minutes: number, seconds: number): number {
  requireFiniteNumber(hours, 'Hours')
  requireFiniteNumber(minutes, 'Minutes')
  requireFiniteNumber(seconds, 'Seconds')
  if (hours < 0 || minutes < 0 || seconds < 0) throw new Error('Duration cannot be negative.')
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) {
    throw new Error('Duration must be whole hours, minutes, and seconds.')
  }
  return hours * 3600 + minutes * 60 + seconds
}

export function parseDurationHms(value: string): number {
  if (typeof value !== 'string') throw new Error('Enter a duration as hh:mm:ss.')
  const trimmed = value.trim()
  const match = /^(\d{1,2}):([0-5]?\d):([0-5]?\d)$/.exec(trimmed)
  if (!match) throw new Error('Enter a duration as hh:mm:ss.')
  return combineDuration(Number(match[1]), Number(match[2]), Number(match[3]))
}

export function formatHms(totalSeconds: number): string {
  const parts = splitDuration(totalSeconds)
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}:${String(parts.seconds).padStart(2, '0')}`
}

export function formatDurationLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h} hour${h === 1 ? '' : 's'}`
  if (m > 0 && s > 0) return `${m}m ${s}s`
  if (m > 0) return `${m} minute${m === 1 ? '' : 's'}`
  return `${s} second${s === 1 ? '' : 's'}`
}

export function volumeToFfmpeg(percent: number): number {
  return clampNumber(percent, MIN_VOLUME_PERCENT, MAX_VOLUME_PERCENT) / 100
}

/**
 * How many source plays are needed. Source >= target is always 1 (trim).
 * Seamless period is source minus crossfade.
 */
export function repeatCount(
  sourceDuration: number,
  targetDuration: number,
  mode: AudioLooperLoopMode,
  crossfadeSeconds = DEFAULT_CROSSFADE_SECONDS,
): number {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return 0
  if (!Number.isFinite(targetDuration) || targetDuration <= 0) return 0
  if (sourceDuration >= targetDuration) return 1
  if (mode === 'seamless') {
    const period = sourceDuration - crossfadeSeconds
    if (!(period > 0)) return 0
    return targetDuration / period
  }
  return targetDuration / sourceDuration
}

export function estimateOutputBytes(
  targetDuration: number,
  format: AudioLooperFormat,
  options?: { bitrate?: AudioLooperBitrate; sampleRate?: number; channels?: number },
): number {
  const duration = Math.max(0, targetDuration)
  if (format === 'mp3') {
    const bitrate = options?.bitrate ?? DEFAULT_MP3_BITRATE
    return Math.round((bitrate * 1000 * duration) / 8)
  }
  const rate = options?.sampleRate && options.sampleRate > 0 ? options.sampleRate : 48000
  const channels = options?.channels && options.channels > 0 ? options.channels : 2
  const pcm = rate * channels * 2 * duration
  if (format === 'flac') return Math.round(pcm * 0.55)
  return Math.round(pcm)
}

export function normalizeSettings(raw: unknown, context: AudioLooperNormalizeContext = {}): AudioLooperSettings {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Loop settings are missing.')
  }
  const data = raw as Record<string, unknown>
  const minDuration = context.minDurationSeconds ?? MIN_DURATION_SECONDS

  if (!isAudioLooperLoopMode(data.loopMode)) throw new Error('Choose Simple or Seamless loop mode.')
  if (data.loopMode === 'seamless' && !SEAMLESS_AVAILABLE) {
    throw new Error('Seamless loop mode is not available.')
  }
  if (!isAudioLooperFormat(data.format)) throw new Error('Choose MP3, WAV, or FLAC.')
  if (!isAudioLooperBitrate(data.mp3Bitrate ?? DEFAULT_MP3_BITRATE)) {
    throw new Error('Choose an MP3 bitrate of 128, 192, 256, or 320 kbps.')
  }

  const targetDurationSeconds = requireIntegerSeconds(data.targetDurationSeconds, 'Target duration')
  if (targetDurationSeconds < minDuration || targetDurationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(
      `Target duration must be between ${formatDurationLabel(minDuration)} and ${formatDurationLabel(MAX_DURATION_SECONDS)}.`,
    )
  }

  const crossfadeSeconds = requireFiniteNumber(data.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS, 'Crossfade')
  if (crossfadeSeconds < 0) throw new Error('Crossfade cannot be negative.')
  if (data.loopMode === 'seamless') {
    if (crossfadeSeconds < MIN_CROSSFADE_SECONDS || crossfadeSeconds > MAX_CROSSFADE_SECONDS) {
      throw new Error(`Crossfade must be between ${MIN_CROSSFADE_SECONDS}s and ${MAX_CROSSFADE_SECONDS}s.`)
    }
  } else if (crossfadeSeconds > MAX_CROSSFADE_SECONDS) {
    throw new Error(`Crossfade must be at most ${MAX_CROSSFADE_SECONDS}s.`)
  }

  let fadeInSeconds = requireFiniteNumber(data.fadeInSeconds ?? 0, 'Fade in')
  let fadeOutSeconds = requireFiniteNumber(data.fadeOutSeconds ?? 0, 'Fade out')
  if (fadeInSeconds < 0 || fadeOutSeconds < 0) throw new Error('Fade times cannot be negative.')
  fadeInSeconds = Math.min(fadeInSeconds, MAX_FADE_SECONDS, targetDurationSeconds)
  fadeOutSeconds = Math.min(fadeOutSeconds, MAX_FADE_SECONDS, targetDurationSeconds)
  if (fadeInSeconds + fadeOutSeconds > targetDurationSeconds) {
    fadeOutSeconds = Math.max(0, targetDurationSeconds - fadeInSeconds)
  }

  const volumePercent = requireFiniteNumber(data.volumePercent ?? DEFAULT_VOLUME_PERCENT, 'Volume')
  if (volumePercent < MIN_VOLUME_PERCENT || volumePercent > MAX_VOLUME_PERCENT) {
    throw new Error('Volume must be between 0% and 200%.')
  }

  const filename = typeof data.filename === 'string' ? sanitizeLooperStem(data.filename) : 'loop'

  const settings: AudioLooperSettings = {
    targetDurationSeconds,
    loopMode: data.loopMode,
    crossfadeSeconds: data.loopMode === 'seamless' ? crossfadeSeconds : Math.min(crossfadeSeconds, MAX_CROSSFADE_SECONDS),
    fadeInSeconds,
    fadeOutSeconds,
    volumePercent,
    format: data.format,
    mp3Bitrate: (data.mp3Bitrate ?? DEFAULT_MP3_BITRATE) as AudioLooperBitrate,
    filename,
  }

  if (context.sourceDuration != null) {
    applySourceConstraints(settings, context.sourceDuration)
  }
  return settings
}

export function applySourceConstraints(settings: AudioLooperSettings, sourceDuration: number): void {
  requireFiniteNumber(sourceDuration, 'Source duration')
  if (sourceDuration <= 0) throw new Error('The audio file has no duration.')
  if (settings.loopMode !== 'seamless') return
  const maxCrossfade = maxCrossfadeForSource(sourceDuration)
  if (settings.crossfadeSeconds >= sourceDuration) {
    throw new Error('Crossfade must be shorter than the source audio.')
  }
  if (settings.crossfadeSeconds > maxCrossfade) {
    throw new Error(
      `Crossfade must be at most ${maxCrossfade.toFixed(2)}s for this source (half the length, and no more than ${MAX_CROSSFADE_SECONDS}s).`,
    )
  }
}

function requireIntegerSeconds(value: unknown, label: string): number {
  const n = requireFiniteNumber(value, label)
  if (!Number.isInteger(n)) throw new Error(`${label} must be a whole number of seconds.`)
  if (n < 0) throw new Error(`${label} cannot be negative.`)
  return n
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return requireFiniteNumber(parsed, label)
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} is not a valid number.`)
  }
  return value
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
