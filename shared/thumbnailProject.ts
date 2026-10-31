import {
  type AnchorId,
  type AnchorPoint,
  type FixedAnchor,
  type NormCrop,
  ANCHOR_IDS,
  anchorPoint,
  clampBadgeMarginPx,
  clampNormCrop,
  clampUnit,
  fullNormCrop,
  migrateLegacyBadgeMargin,
  nudgeForSharedAnchor,
  presetAnchorPoint,
} from './thumbnailLayout'

export const THUMBNAIL_DOCUMENT_VERSION = 2
export const PREVIEW_MAX_EDGE = 960
export const PENDING_ASSET_REF = 'pending-transfer'
export const THUMBNAIL_DOCUMENT_KEY = 'document'
export const THUMBNAIL_CANVAS_COLOR = '#101114'
/** Default edge inset at 1280×720 export (5% of the short side). */
export const DEFAULT_BADGE_MARGIN = 16

export const THUMBNAIL_OUTPUTS = [
  { width: 1280, height: 720, label: '1280 × 720' },
  { width: 1920, height: 1080, label: '1920 × 1080' },
  { width: 3840, height: 2160, label: '3840 × 2160' },
] as const

export type ThumbnailFit = 'contain' | 'cover'
export type ThumbnailSourceApp = 'frame-screensaver' | 'ranking-videos' | 'standalone'
export type ThumbnailLinkMode = 'snapshot' | 'linked'
export type QualityId = '720' | '1080' | '1440' | '4k' | '8k'
export type BadgeStyleId = 'gold-plate' | 'silver-plate' | 'gold-stack' | 'silver-stack' | 'gold' | 'silver' | 'outline' | 'invert'
export type BadgeId = 'resolution' | 'duration'

export const QUALITY_OPTIONS: { id: QualityId; label: string }[] = [
  { id: '720', label: '720P' },
  { id: '1080', label: '1080P' },
  { id: '1440', label: '1440P' },
  { id: '4k', label: '4K UHD' },
  { id: '8k', label: '8K UHD' },
]

export const BADGE_STYLES: { id: BadgeStyleId; label: string }[] = [
  { id: 'gold-plate', label: 'Gold plate' },
  { id: 'silver-plate', label: 'Silver plate' },
  { id: 'gold-stack', label: 'Gold stack' },
  { id: 'silver-stack', label: 'Silver stack' },
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'outline', label: 'Outline' },
  { id: 'invert', label: 'Invert' },
]

export const BADGE_SCALE_MIN = 0.25
export const BADGE_SCALE_MAX = 2

export interface BadgeAppearance {
  styleId: BadgeStyleId
  scale: number
}

export interface BadgeLines {
  hero: string
  foot: string | null
}

export interface ThumbnailBadge {
  enabled: boolean
  text: string
  anchor: AnchorId
  x: number
  y: number
  /** Distance from the frame edge in export pixels (horizontal and vertical). */
  margin: number
  offsetX: number
  offsetY: number
  deliberate: boolean
  appearance: BadgeAppearance
}

export interface ThumbnailImage {
  assetId: string | null
  frameAssetId: string | null
  composition: unknown | null
  fit: ThumbnailFit
  crop: NormCrop
  sourceWidth: number
  sourceHeight: number
}

export interface ThumbnailExportSettings {
  width: number
  height: number
  format: 'png' | 'jpeg'
  jpegQuality: number
}

export interface ThumbnailSource {
  app: ThumbnailSourceApp
  linkMode: ThumbnailLinkMode
  returnPath: string | null
  sourceProjectId: string | null
  videoWidth: number | null
  videoHeight: number | null
  durationSeconds: number | null
}

export interface ThumbnailDocument {
  version: 2
  id: string
  image: ThumbnailImage
  resolution: ThumbnailBadge
  duration: ThumbnailBadge
  export: ThumbnailExportSettings
  source: ThumbnailSource
  updatedAt: number
}

export function badgeAppearance(styleId: BadgeStyleId, scale = 0.7): BadgeAppearance {
  return { styleId, scale: clampBadgeScale(scale) }
}

export function clampBadgeScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(BADGE_SCALE_MAX, Math.max(BADGE_SCALE_MIN, value))
}

/** Compact chip label: resolution `4K` / `1080P`, duration `8H` / `30M`. */
export function chipLabel(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ').toUpperCase()
  if (!trimmed) return ''
  const kilo = /^(\d+)\s*K(?:\s+UHD)?$/.exec(trimmed)
  if (kilo) return `${kilo[1]}K`
  const progressive = /^(\d+)\s*P$/.exec(trimmed)
  if (progressive) return `${progressive[1]}P`
  const both = /^(\d+)\s+HOURS?\s+(\d+)\s+MIN$/.exec(trimmed)
  if (both) {
    const hours = Number(both[1])
    const minutes = Number(both[2])
    if (hours > 0) return `${hours}H`
    return `${minutes}M`
  }
  const hours = /^(\d+)\s+HOURS?$/.exec(trimmed)
  if (hours) return `${hours[1]}H`
  const mins = /^(\d+)\s+MIN$/.exec(trimmed)
  if (mins) return `${mins[1]}M`
  return trimmed
}

/** Split a resolution or duration label into the large line and the footer. */
export function badgeLines(text: string): BadgeLines {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { hero: '', foot: null }
  const uhd = /^(\d+\s*K)\s+UHD$/i.exec(trimmed)
  if (uhd) return { hero: uhd[1].replace(/\s+/g, '').toUpperCase(), foot: 'ULTRA HD' }
  const duration = /^(\d+)\s+((?:HOURS?|MIN)(?:\s+\d+\s+MIN)?)$/i.exec(trimmed)
  if (duration) return { hero: duration[1], foot: duration[2].toUpperCase() }
  const parts = trimmed.split(' ')
  if (parts.length >= 2 && parts[0].length <= 8) return { hero: parts[0].toUpperCase(), foot: parts.slice(1).join(' ').toUpperCase() }
  return { hero: trimmed.toUpperCase(), foot: null }
}

export function createThumbnailId(): string {
  return crypto.randomUUID()
}

export function qualityFromResolution(width: number, height: number): { id: QualityId; label: string } {
  const short = Math.min(Math.max(0, width), Math.max(0, height))
  if (short >= 4320) return { id: '8k', label: '8K UHD' }
  if (short >= 2160) return { id: '4k', label: '4K UHD' }
  if (short >= 1440) return { id: '1440', label: '1440P' }
  if (short >= 1080) return { id: '1080', label: '1080P' }
  if (short >= 720) return { id: '720', label: '720P' }
  if (short > 0) return { id: '720', label: `${Math.round(short)}P` }
  return { id: '720', label: '' }
}

export function qualityIdFromText(text: string): QualityId {
  const found = QUALITY_OPTIONS.find((item) => item.label.toLowerCase() === text.trim().toLowerCase())
  return found?.id ?? '720'
}

export function formatBadgeDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) return `${hours} ${hours === 1 ? 'HOUR' : 'HOURS'} ${minutes} MIN`
  if (hours > 0) return `${hours} ${hours === 1 ? 'HOUR' : 'HOURS'}`
  return `${totalMinutes} MIN`
}

export function formatDurationParts(hours: number, minutes: number): string {
  const h = Math.max(0, Math.min(99, Math.round(hours)))
  const m = Math.max(0, Math.min(59, Math.round(minutes)))
  if (h === 0 && m === 0) return ''
  return formatBadgeDuration((h * 60 + m) * 60)
}

export function parseDurationText(text: string): { hours: number; minutes: number } | null {
  const trimmed = text.trim().toUpperCase()
  const both = /^(\d+)\s+HOURS?\s+(\d+)\s+MIN$/.exec(trimmed)
  if (both) return { hours: Number(both[1]), minutes: Number(both[2]) }
  const hours = /^(\d+)\s+HOURS?$/.exec(trimmed)
  if (hours) return { hours: Number(hours[1]), minutes: 0 }
  const mins = /^(\d+)\s+MIN$/.exec(trimmed)
  if (mins) return { hours: 0, minutes: Number(mins[1]) }
  return null
}

export function exactExportSize(width: number, height: number): { width: number; height: number } {
  const match = THUMBNAIL_OUTPUTS.find((item) => item.width === width && item.height === height)
  return match ? { width: match.width, height: match.height } : { width: 1280, height: 720 }
}

export function previewPixelSize(width: number, height: number, maxEdge = PREVIEW_MAX_EDGE): { width: number; height: number } {
  const exact = exactExportSize(width, height)
  const edge = Math.max(exact.width, exact.height)
  if (edge <= maxEdge) return exact
  const scale = maxEdge / edge
  return {
    width: Math.max(1, Math.round(exact.width * scale)),
    height: Math.max(1, Math.round(exact.height * scale)),
  }
}

export function thumbnailFilename(format: 'png' | 'jpeg', width: number, height: number): string {
  return `thumbnail-${width}x${height}.${format === 'jpeg' ? 'jpg' : 'png'}`
}

export function assetIdsInDocument(doc: ThumbnailDocument): string[] {
  const ids = [doc.image.assetId, doc.image.frameAssetId].filter((id): id is string => Boolean(id))
  return [...new Set(ids)]
}

export function badgeAnchorPoint(badge: ThumbnailBadge, frameWidth: number, frameHeight: number): AnchorPoint {
  if (badge.anchor === 'free' || badge.deliberate) return { x: badge.x, y: badge.y }
  return presetAnchorPoint(badge.anchor, badge.margin, badge.offsetX, badge.offsetY, frameWidth, frameHeight)
}

export function syncPresetBadgeCoords(badge: ThumbnailBadge, frameWidth: number, frameHeight: number): void {
  if (badge.anchor === 'free' || badge.deliberate) return
  const point = presetAnchorPoint(badge.anchor, badge.margin, badge.offsetX, badge.offsetY, frameWidth, frameHeight)
  badge.x = point.x
  badge.y = point.y
}

export function applyBadgeStyle(badge: ThumbnailBadge, styleId: BadgeStyleId): ThumbnailBadge {
  return { ...badge, appearance: badgeAppearance(styleId, badge.appearance.scale) }
}

export function placeBadge(
  badge: ThumbnailBadge,
  anchor: FixedAnchor,
  other: ThumbnailBadge,
  frameWidth: number,
  frameHeight: number,
): ThumbnailBadge {
  const margin = clampBadgeMarginPx(badge.margin, frameWidth, frameHeight)
  const base = anchorPoint(anchor, margin, frameWidth, frameHeight)
  let offsetX = 0
  let offsetY = 0
  if (sharesPresetPoint(other, anchor, base, frameWidth, frameHeight)) {
    const nudge = nudgeForSharedAnchor(anchor)
    offsetX = nudge.x
    offsetY = nudge.y
  }
  const point = presetAnchorPoint(anchor, margin, offsetX, offsetY, frameWidth, frameHeight)
  return {
    ...badge,
    appearance: { ...badge.appearance },
    anchor,
    deliberate: false,
    margin,
    offsetX,
    offsetY,
    x: point.x,
    y: point.y,
  }
}

export function resetBadgePosition(
  badge: ThumbnailBadge,
  role: BadgeId,
  other: ThumbnailBadge,
  frameWidth: number,
  frameHeight: number,
): ThumbnailBadge {
  const anchor: FixedAnchor = role === 'resolution' ? 'top-left' : 'bottom-left'
  return placeBadge({ ...badge, margin: DEFAULT_BADGE_MARGIN, offsetX: 0, offsetY: 0 }, anchor, other, frameWidth, frameHeight)
}

export function dragBadge(badge: ThumbnailBadge, x: number, y: number): ThumbnailBadge {
  return {
    ...badge,
    appearance: { ...badge.appearance },
    anchor: 'free',
    deliberate: true,
    offsetX: 0,
    offsetY: 0,
    x: clampUnit(x, -0.25, 1.25),
    y: clampUnit(y, -0.25, 1.25),
  }
}

export function createThumbnailDocument(): ThumbnailDocument {
  return {
    version: 2,
    id: createThumbnailId(),
    image: {
      assetId: null,
      frameAssetId: null,
      composition: null,
      fit: 'cover',
      crop: fullNormCrop(),
      sourceWidth: 0,
      sourceHeight: 0,
    },
    resolution: defaultBadge('4K UHD', 'top-left'),
    duration: defaultBadge('2 HOURS', 'bottom-left'),
    export: { width: 1280, height: 720, format: 'png', jpegQuality: 0.92 },
    source: {
      app: 'standalone',
      linkMode: 'snapshot',
      returnPath: null,
      sourceProjectId: null,
      videoWidth: null,
      videoHeight: null,
      durationSeconds: null,
    },
    updatedAt: 0,
  }
}

export function parseThumbnailDocument(raw: unknown): ThumbnailDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (data.version !== THUMBNAIL_DOCUMENT_VERSION) return null
  if (typeof data.id !== 'string' || !data.id.trim()) return null
  const image = parseImage(data.image)
  if (!image) return null
  const fallback = createThumbnailDocument()
  fallback.id = data.id.trim()
  const size = exactExportSize(numberOr(data.export && (data.export as { width?: unknown }).width, 1280), numberOr(data.export && (data.export as { height?: unknown }).height, 720))
  const resolution = parseBadge(data.resolution, fallback.resolution, size.width, size.height)
  const duration = parseBadge(data.duration, fallback.duration, size.width, size.height)
  const exp = data.export && typeof data.export === 'object' ? (data.export as Record<string, unknown>) : {}
  const source = parseSource(data.source)
  return {
    version: 2,
    id: data.id.trim(),
    image,
    resolution,
    duration,
    export: {
      width: size.width,
      height: size.height,
      format: exp.format === 'jpeg' ? 'jpeg' : 'png',
      jpegQuality: clampUnit(numberOr(exp.jpegQuality, 0.92), 0.5, 1),
    },
    source,
    updatedAt: numberOr(data.updatedAt, 0),
  }
}

export function legacyThumbnailAssets(raw: unknown): { projectId: string; assetIds: string[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as { version?: unknown; id?: unknown; layers?: unknown }
  if (data.version === THUMBNAIL_DOCUMENT_VERSION) return null
  if (typeof data.id !== 'string' || !data.id.trim() || !Array.isArray(data.layers)) return null
  const assetIds: string[] = []
  for (const layer of data.layers) {
    if (!layer || typeof layer !== 'object') continue
    const assetId = (layer as { assetId?: unknown }).assetId
    if (typeof assetId === 'string' && assetId.trim()) assetIds.push(assetId.trim())
  }
  return { projectId: data.id.trim(), assetIds: [...new Set(assetIds)] }
}

function defaultBadge(text: string, anchor: FixedAnchor): ThumbnailBadge {
  const frameWidth = 1280
  const frameHeight = 720
  const point = anchorPoint(anchor, DEFAULT_BADGE_MARGIN, frameWidth, frameHeight)
  return {
    enabled: false,
    text,
    anchor,
    x: point.x,
    y: point.y,
    margin: DEFAULT_BADGE_MARGIN,
    offsetX: 0,
    offsetY: 0,
    deliberate: false,
    appearance: badgeAppearance('gold-plate'),
  }
}

function sharesPresetPoint(
  other: ThumbnailBadge,
  anchor: FixedAnchor,
  base: AnchorPoint,
  frameWidth: number,
  frameHeight: number,
): boolean {
  if (!other.enabled || other.deliberate || other.anchor !== anchor) return false
  const point = badgeAnchorPoint(other, frameWidth, frameHeight)
  return Math.abs(point.x - base.x) < 0.02 && Math.abs(point.y - base.y) < 0.02
}

function parseImage(raw: unknown): ThumbnailImage | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const cropRaw = data.crop && typeof data.crop === 'object' ? (data.crop as Partial<NormCrop>) : {}
  return {
    assetId: optionalId(data.assetId),
    frameAssetId: optionalId(data.frameAssetId),
    composition: data.composition && typeof data.composition === 'object' ? data.composition : null,
    fit: data.fit === 'contain' ? 'contain' : 'cover',
    crop: clampNormCrop({
      x: numberOr(cropRaw.x, 0),
      y: numberOr(cropRaw.y, 0),
      w: numberOr(cropRaw.w, 1),
      h: numberOr(cropRaw.h, 1),
    }),
    sourceWidth: Math.max(0, Math.round(numberOr(data.sourceWidth, 0))),
    sourceHeight: Math.max(0, Math.round(numberOr(data.sourceHeight, 0))),
  }
}

function parseBadge(raw: unknown, fallback: ThumbnailBadge, frameWidth: number, frameHeight: number): ThumbnailBadge {
  if (!raw || typeof raw !== 'object') return fallback
  const data = raw as Record<string, unknown>
  const anchor = parseAnchor(data.anchor, fallback.anchor)
  const deliberate = data.deliberate === true || anchor === 'free'
  const margin = migrateLegacyBadgeMargin(numberOr(data.margin, fallback.margin), frameWidth, frameHeight)
  const offsetX = clampUnit(numberOr(data.offsetX, 0), -0.45, 0.45)
  const offsetY = clampUnit(numberOr(data.offsetY, 0), -0.45, 0.45)
  let x = clampUnit(numberOr(data.x, fallback.x), -0.25, 1.25)
  let y = clampUnit(numberOr(data.y, fallback.y), -0.25, 1.25)
  if (anchor !== 'free' && !deliberate) {
    const point = presetAnchorPoint(anchor, margin, offsetX, offsetY, frameWidth, frameHeight)
    x = point.x
    y = point.y
  }
  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : fallback.enabled,
    text: typeof data.text === 'string' ? data.text.trim().slice(0, 32) : fallback.text,
    anchor: deliberate && anchor !== 'free' ? 'free' : anchor,
    x,
    y,
    margin,
    offsetX: deliberate ? 0 : offsetX,
    offsetY: deliberate ? 0 : offsetY,
    deliberate,
    appearance: parseAppearance(data.appearance, fallback.appearance),
  }
}

function parseAppearance(raw: unknown, fallback: BadgeAppearance): BadgeAppearance {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const data = raw as { styleId?: unknown; scale?: unknown }
  const scale = typeof data.scale === 'number' ? data.scale : fallback.scale
  return { styleId: normalizeStyleId(data.styleId, fallback.styleId), scale: clampBadgeScale(scale) }
}

function parseSource(raw: unknown): ThumbnailSource {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const app: ThumbnailSourceApp = data.app === 'frame-screensaver' || data.app === 'ranking-videos' ? data.app : 'standalone'
  const returnPath = data.returnPath === '/' || data.returnPath === '/ranking-videos' || data.returnPath === '/frame-screensaver' || data.returnPath === '/thumbnail-studio'
    ? data.returnPath
    : null
  return {
    app,
    linkMode: data.linkMode === 'linked' ? 'linked' : 'snapshot',
    returnPath,
    sourceProjectId: optionalId(data.sourceProjectId),
    videoWidth: positive(data.videoWidth),
    videoHeight: positive(data.videoHeight),
    durationSeconds: positive(data.durationSeconds),
  }
}

function parseAnchor(value: unknown, fallback: AnchorId): AnchorId {
  if (value === 'free') return 'free'
  if (typeof value === 'string' && (ANCHOR_IDS as readonly string[]).includes(value)) return value as FixedAnchor
  return fallback
}

function normalizeStyleId(value: unknown, fallback: BadgeStyleId): BadgeStyleId {
  if (value === 'gold-plate' || value === 'silver-plate' || value === 'gold-stack' || value === 'gold' || value === 'silver' || value === 'outline' || value === 'invert') return value
  if (value === 'mono' || value === 'line' || value === 'luxury-gold') return 'gold-plate'
  if (value === 'minimal-white' || value === 'transparent') return 'outline'
  if (value === 'modern-dark') return 'invert'
  return fallback
}

function optionalId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 80) : null
}

function numberOr(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function positive(value: unknown): number | null {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number
}
