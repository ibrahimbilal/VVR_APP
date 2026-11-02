import { DEFAULT_SCREENSAVER_OUTPUT } from './screensaver'

export const SUBSCRIBE_ANIMATION_FPS = 30

export const SUBSCRIBE_ANIMATION_DURATION_SEC = 7

export const DEFAULT_SUBSCRIBE_CHANNEL_NAME = 'Ribo Gallery TV'

export const DEFAULT_SUBSCRIBE_CHANNEL_URL = 'https://www.youtube.com/@RiboGalleryTV'

export const SUBSCRIBE_ANIMATION_POSITIONS = ['bottom-left', 'bottom-center', 'bottom-right'] as const

export type SubscribeAnimationPosition = (typeof SUBSCRIBE_ANIMATION_POSITIONS)[number]

export const SUBSCRIBE_ANIMATION_STYLES = [
  { id: 'channel-card', label: 'Channel card' },
  { id: 'subscribe-only', label: 'Subscribe button only' },
  { id: 'subscribe-alerts', label: 'Subscribe + alerts' },
  { id: 'like-subscribe-alerts', label: 'Like + subscribe + alerts' },
] as const

export type SubscribeAnimationStyle = (typeof SUBSCRIBE_ANIMATION_STYLES)[number]['id']

export const SUBSCRIBE_CHANNEL_CARD_THEMES = ['dark', 'light'] as const

export type SubscribeChannelCardTheme = (typeof SUBSCRIBE_CHANNEL_CARD_THEMES)[number]

export const DEFAULT_SUBSCRIBE_EDGE_DISTANCE = 0

export const MIN_SUBSCRIBE_EDGE_DISTANCE = 0
export const MAX_SUBSCRIBE_EDGE_DISTANCE = 240

/** Animation content width as a percent of export frame width. */
export const MIN_SUBSCRIBE_SIZE_PERCENT = 5
export const MAX_SUBSCRIBE_SIZE_PERCENT = 75

/** Max total PNG bytes for one subscribe animation upload (screensaver export multer budget). */
export const SUBSCRIBE_ANIMATION_UPLOAD_BUDGET_BYTES = 72 * 1024 * 1024

/** Heuristic: sparse transparent UI PNG ≈ this fraction of raw RGBA size. */
export const SUBSCRIBE_ANIMATION_PNG_SIZE_FACTOR = 0.35

export function subscribeDesignWidthForStyle(style: SubscribeAnimationStyle): number {
  switch (style) {
    case 'subscribe-only':
      return 168
    case 'subscribe-alerts':
      return 252
    case 'like-subscribe-alerts':
      return 336
    case 'channel-card':
    default:
      return 420
  }
}

export const DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE: Record<SubscribeAnimationStyle, number> = {
  'channel-card': 27,
  'subscribe-only': 12,
  'subscribe-alerts': 18,
  'like-subscribe-alerts': 25,
}

export function defaultSubscribeSizePercent(style: SubscribeAnimationStyle): number {
  return DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE[style]
}

/** @deprecated Use `defaultSubscribeSizePercent('channel-card')`. */
export const DEFAULT_SUBSCRIBE_SIZE_PERCENT = DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE['channel-card']

export interface SubscribeAnimationSettings {
  enabled: boolean
  channelName: string
  startSec: number
  durationSec: number
  position: SubscribeAnimationPosition
  /** Content width as a percent of export frame width (see `subscribeAnimationLayout`). */
  sizePercent: number
  /** Distance from output frame edges in export pixels (bottom + horizontal). */
  edgeDistance: number
  style: SubscribeAnimationStyle
  /** Loop subscribe animation on the main preview canvas while editing. */
  previewOnCanvas: boolean
  /** Channel card only: visual theme. */
  channelCardTheme: SubscribeChannelCardTheme
  /** YouTube channel or video URL used to fetch channel name / avatar. */
  channelUrl: string
  /** Remote avatar URL (from lookup); drawn when loaded in the client. */
  channelAvatarUrl: string | null
  /** e.g. "1.23M subscribers" from YouTube lookup. */
  channelSubscriberCount: string | null
}

export function defaultSubscribeAnimation(): SubscribeAnimationSettings {
  return {
    enabled: true,
    channelName: DEFAULT_SUBSCRIBE_CHANNEL_NAME,
    startSec: 3,
    durationSec: SUBSCRIBE_ANIMATION_DURATION_SEC,
    position: 'bottom-center',
    sizePercent: defaultSubscribeSizePercent('channel-card'),
    edgeDistance: DEFAULT_SUBSCRIBE_EDGE_DISTANCE,
    style: 'channel-card',
    previewOnCanvas: true,
    channelCardTheme: 'dark',
    channelUrl: DEFAULT_SUBSCRIBE_CHANNEL_URL,
    channelAvatarUrl: null,
    channelSubscriberCount: null,
  }
}

export function subscribeAnimationFrameCount(durationSec: number): number {
  return Math.round(Math.max(0, durationSec) * SUBSCRIBE_ANIMATION_FPS)
}

export function isSubscribeAnimationPosition(value: unknown): value is SubscribeAnimationPosition {
  return typeof value === 'string' && (SUBSCRIBE_ANIMATION_POSITIONS as readonly string[]).includes(value)
}

export function isSubscribeAnimationStyle(value: unknown): value is SubscribeAnimationStyle {
  return typeof value === 'string' && SUBSCRIBE_ANIMATION_STYLES.some((item) => item.id === value)
}

export function isSubscribeChannelCardTheme(value: unknown): value is SubscribeChannelCardTheme {
  return typeof value === 'string' && (SUBSCRIBE_CHANNEL_CARD_THEMES as readonly string[]).includes(value)
}

export function subscribeAnimationStyleLabel(style: SubscribeAnimationStyle): string {
  return SUBSCRIBE_ANIMATION_STYLES.find((item) => item.id === style)?.label ?? style
}

export function sanitizeSubscribeAnimation(raw: unknown): SubscribeAnimationSettings {
  const defaults = defaultSubscribeAnimation()
  if (!raw || typeof raw !== 'object') return defaults
  const data = raw as Partial<SubscribeAnimationSettings>
  const enabled = Boolean(data.enabled)
  const channelName =
    typeof data.channelName === 'string' && data.channelName.trim()
      ? data.channelName.trim().slice(0, 80)
      : defaults.channelName
  const startSec = Number.isFinite(Number(data.startSec)) ? Math.max(0, Number(data.startSec)) : defaults.startSec
  const durationSec = SUBSCRIBE_ANIMATION_DURATION_SEC
  const position = isSubscribeAnimationPosition(data.position) ? data.position : defaults.position
  const style = isSubscribeAnimationStyle(data.style) ? data.style : defaults.style
  const sizePercent = resolveSubscribeSizePercent(data, style, defaultSubscribeSizePercent(style))
  const edgeRaw = Number(data.edgeDistance)
  const edgeDistance = Number.isFinite(edgeRaw)
    ? Math.max(MIN_SUBSCRIBE_EDGE_DISTANCE, Math.min(MAX_SUBSCRIBE_EDGE_DISTANCE, Math.round(edgeRaw)))
    : defaults.edgeDistance
  const previewOnCanvas = data.previewOnCanvas === false ? false : defaults.previewOnCanvas
  const channelCardTheme = isSubscribeChannelCardTheme(data.channelCardTheme) ? data.channelCardTheme : defaults.channelCardTheme
  const channelUrl =
    typeof data.channelUrl === 'string' && data.channelUrl.trim()
      ? data.channelUrl.trim().slice(0, 600)
      : defaults.channelUrl
  const channelAvatarUrl =
    typeof data.channelAvatarUrl === 'string' && data.channelAvatarUrl.trim()
      ? data.channelAvatarUrl.trim().slice(0, 500)
      : data.channelAvatarUrl === null
        ? null
        : defaults.channelAvatarUrl
  const channelSubscriberCount =
    typeof data.channelSubscriberCount === 'string' && data.channelSubscriberCount.trim()
      ? data.channelSubscriberCount.trim().slice(0, 48)
      : data.channelSubscriberCount === null
        ? null
        : defaults.channelSubscriberCount
  return {
    enabled,
    channelName,
    startSec,
    durationSec,
    position,
    sizePercent,
    edgeDistance,
    style,
    previewOnCanvas,
    channelCardTheme,
    channelUrl,
    channelAvatarUrl,
    channelSubscriberCount,
  }
}

export interface SubscribeAnimationValidation {
  ok: boolean
  message: string | null
}

function clampSubscribeSizePercent(value: number): number {
  return Math.max(MIN_SUBSCRIBE_SIZE_PERCENT, Math.min(MAX_SUBSCRIBE_SIZE_PERCENT, Math.round(value * 10) / 10))
}

/** Maps persisted `sizePercent` or legacy design `scale` (0.5–1.5) to output-relative percent. */
function resolveSubscribeSizePercent(
  data: Partial<SubscribeAnimationSettings> & { scale?: number },
  style: SubscribeAnimationStyle,
  fallback: number,
): number {
  const percentRaw = Number(data.sizePercent)
  if (Number.isFinite(percentRaw)) return clampSubscribeSizePercent(percentRaw)
  const scaleRaw = Number(data.scale)
  if (Number.isFinite(scaleRaw) && scaleRaw >= MIN_SUBSCRIBE_SIZE_PERCENT && scaleRaw <= MAX_SUBSCRIBE_SIZE_PERCENT) {
    return clampSubscribeSizePercent(scaleRaw)
  }
  if (Number.isFinite(scaleRaw) && scaleRaw >= 0.5 && scaleRaw <= 1.5) {
    const designWidth = subscribeDesignWidthForStyle(style)
    const legacyContentWidth = designWidth * scaleRaw
    return clampSubscribeSizePercent((legacyContentWidth / DEFAULT_SCREENSAVER_OUTPUT.width) * 100)
  }
  return fallback
}

export function validateSubscribeAnimation(
  settings: SubscribeAnimationSettings,
  exportDurationSec: number,
  options?: { staticImage?: boolean },
): SubscribeAnimationValidation {
  if (!settings.enabled) return { ok: true, message: null }
  if (options?.staticImage === false) {
    return { ok: false, message: 'Subscribe animation is only supported for static image exports.' }
  }
  if (!Number.isFinite(exportDurationSec) || exportDurationSec <= 0) {
    return { ok: false, message: 'Export duration is invalid.' }
  }
  if (settings.startSec < 0) {
    return { ok: false, message: 'Animation start time must be zero or greater.' }
  }
  if (settings.startSec + settings.durationSec > exportDurationSec + 0.01) {
    return { ok: false, message: 'The animation must fit inside the export duration.' }
  }
  if (subscribeAnimationFrameCount(settings.durationSec) < 1) {
    return { ok: false, message: 'Animation duration is too short.' }
  }
  return { ok: true, message: null }
}
