import {
  type AnchorId,
  type FixedAnchor,
  type NormCrop,
  ANCHOR_IDS,
  anchorPoint,
  fullNormCrop,
  snapNorm,
  topLeftFromAnchor,
} from './thumbnailLayout'

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const THUMBNAIL_PROJECT_VERSION = 1
export const PREVIEW_MAX_EDGE = 960
export const YOUTUBE_THUMBNAIL_BYTES = 2_000_000
export const PENDING_ASSET_REF = 'pending-transfer'

export const THUMBNAIL_OUTPUTS = [
  { width: 1280, height: 720, label: '1280 × 720' },
  { width: 1920, height: 1080, label: '1920 × 1080' },
  { width: 2560, height: 1440, label: '2560 × 1440' },
  { width: 3840, height: 2160, label: '3840 × 2160' },
] as const

export const THUMBNAIL_ASPECTS = ['16:9', '1:1', '9:16', 'custom'] as const
export type ThumbnailAspect = (typeof THUMBNAIL_ASPECTS)[number]
export type ThumbnailFit = 'contain' | 'cover'
export type LayerKind = 'artwork' | 'frame' | 'background' | 'image' | 'text' | 'badge' | 'shape'
export type BadgeRole = 'quality' | 'duration' | 'content'
export type TextRole = 'title' | 'custom'
export type SeasonId = 'autumn' | 'winter' | 'holiday'
export type TemplateId =
  | 'luxury-gold'
  | 'elegant-gallery'
  | 'modern-dark'
  | 'minimal-white'
  | 'cinematic'
  | 'bold-youtube'
  | 'clean-artwork'
  | 'nature'
  | 'seasonal'

export type QualityId = '720' | '1080' | '1440' | '4k' | '8k' | 'custom'
export type ContentBadgeId = 'no-music' | 'relaxing-art' | 'frame-tv' | 'ambient-art' | 'loop' | 'sleep' | 'custom'
export type ThumbnailSourceApp = 'frame-screensaver' | 'ranking-videos' | 'standalone'
export type ThumbnailLinkMode = 'snapshot' | 'linked'

export const CONTENT_BADGES: { id: ContentBadgeId; label: string }[] = [
  { id: 'no-music', label: 'NO MUSIC' },
  { id: 'relaxing-art', label: 'RELAXING ART' },
  { id: 'frame-tv', label: 'FRAME TV' },
  { id: 'ambient-art', label: 'AMBIENT ART' },
  { id: 'loop', label: 'LOOP' },
  { id: 'sleep', label: 'SLEEP' },
  { id: 'custom', label: 'CUSTOM' },
]

export const QUALITY_OPTIONS: { id: QualityId; label: string }[] = [
  { id: '720', label: '720P' },
  { id: '1080', label: '1080P' },
  { id: '1440', label: '1440P' },
  { id: '4k', label: '4K UHD' },
  { id: '8k', label: '8K UHD' },
  { id: 'custom', label: 'Custom' },
]

export const SEASONS: Record<SeasonId, { background: string; accent: string; text: string; badge: string; border: string }> = {
  autumn: { background: '#2a1810', accent: '#d4782a', text: '#f4e6d4', badge: '#3a2414', border: '#d4782a' },
  winter: { background: '#101820', accent: '#9fd4e0', text: '#f2f7fa', badge: '#182430', border: '#9fd4e0' },
  holiday: { background: '#1a0e12', accent: '#c9a227', text: '#f7f1e3', badge: '#2a161c', border: '#c9a227' },
}

export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  letterSpacing: number
  lineHeight: number
  align: 'left' | 'center' | 'right'
  color: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  shadowX: number
  shadowY: number
}

export interface BoxStyle {
  fill: 'solid' | 'gradient' | 'none'
  color: string
  color2: string
  fillOpacity: number
  radius: number
  borderColor: string
  borderWidth: number
  padding: number
  shadowColor: string
  shadowBlur: number
  shadowX: number
  shadowY: number
  glowColor: string
  glowBlur: number
}

export interface ThumbnailLayer {
  id: string
  kind: LayerKind
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  z: number
  anchor: AnchorId
  assetId: string | null
  text: string
  userEdited: boolean
  textRole: TextRole | null
  badgeRole: BadgeRole | null
  contentBadge: ContentBadgeId | null
  fit: ThumbnailFit
  crop: NormCrop
  sourceWidth: number
  sourceHeight: number
  blur: number
  textStyle: TextStyle
  boxStyle: BoxStyle
  /** Screensaver composition JSON, kept as unknown here and validated on transfer. */
  composition: unknown | null
}

export interface ThumbnailProject {
  version: 1
  id: string
  name: string
  templateId: TemplateId
  season: SeasonId
  width: number
  height: number
  aspect: ThumbnailAspect
  linkMode: ThumbnailLinkMode
  sourceApp: ThumbnailSourceApp
  sourceProjectId: string | null
  returnPath: string | null
  videoWidth: number | null
  videoHeight: number | null
  durationSeconds: number | null
  durationOverride: string | null
  qualityOverride: string | null
  safeMargin: number
  snapGrid: number
  snapCenter: boolean
  showGuides: boolean
  showSafeArea: boolean
  autoContrast: boolean
  autoLayout: boolean
  layers: ThumbnailLayer[]
  updatedAt: number
}

export interface ThumbnailCatalogEntry {
  id: string
  name: string
  updatedAt: number
  templateId: TemplateId
  width: number
  height: number
}

export interface PresetLayer {
  kind: LayerKind
  name: string
  textRole: TextRole | null
  badgeRole: BadgeRole | null
  contentBadge: ContentBadgeId | null
  anchor: AnchorId
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  z: number
  blur: number
  fit: ThumbnailFit
  text: string
  textStyle: TextStyle
  boxStyle: BoxStyle
}

export interface ThumbnailPreset {
  version: 1
  id: string
  name: string
  templateId: TemplateId
  season: SeasonId
  safeMargin: number
  autoContrast: boolean
  autoLayout: boolean
  snapGrid: number
  snapCenter: boolean
  layers: PresetLayer[]
}

export interface TemplateInfo {
  id: TemplateId
  name: string
  description: string
}

interface TemplateRecipe {
  background: string
  background2: string
  backgroundFill: 'solid' | 'gradient' | 'none'
  titleFont: string
  titleColor: string
  titleSize: number
  titleWeight: number
  badgeFont: string
  badgeColor: string
  badgeFill: string
  badgeBorder: string
  badgeSize: number
  badgeWeight: number
  showTitle: boolean
  showBadges: boolean
  radius: number
  letterSpacing: number
  qualityWidth: number
  badgeHeight: number
}

export const THUMBNAIL_TEMPLATES: readonly TemplateInfo[] = Object.freeze([
  Object.freeze({ id: 'luxury-gold' as const, name: 'Luxury Gold', description: 'Black and gold, suited to a gallery TV.' }),
  Object.freeze({ id: 'elegant-gallery' as const, name: 'Elegant Gallery', description: 'Serif type and wide spacing.' }),
  Object.freeze({ id: 'modern-dark' as const, name: 'Modern Dark', description: 'Dark badges and white type.' }),
  Object.freeze({ id: 'minimal-white' as const, name: 'Minimal White', description: 'Light background, little decoration.' }),
  Object.freeze({ id: 'cinematic' as const, name: 'Cinematic', description: 'High contrast and tall type.' }),
  Object.freeze({ id: 'bold-youtube' as const, name: 'Bold YouTube', description: 'Large badges that stay readable when small.' }),
  Object.freeze({ id: 'clean-artwork' as const, name: 'Clean Artwork', description: 'Artwork only, no badges or title.' }),
  Object.freeze({ id: 'nature' as const, name: 'Nature & Relaxation', description: 'Muted greens and small type.' }),
  Object.freeze({ id: 'seasonal' as const, name: 'Seasonal', description: 'Autumn, winter, or holiday colors.' }),
])

const TEMPLATE_RECIPES: Record<TemplateId, TemplateRecipe> = Object.freeze({
  'luxury-gold': recipe('#0c0b09', '#1a140c', 'Georgia, "Times New Roman", serif', '#e6c36a', 0.08, 700, 'Oswald, sans-serif', '#f3e6c4', '#1a1408', '#c6a15b', 0.052, 600, true, true, 0.012, 0.06, 0.26, 0.12),
  'elegant-gallery': recipe('#f7f4ee', '#f7f4ee', 'Georgia, "Times New Roman", serif', '#1c1915', 0.07, 500, 'Georgia, "Times New Roman", serif', '#1c1915', '#00000000', '#1c1915', 0.046, 500, true, true, 0, 0.12, 0.28, 0.1),
  'modern-dark': recipe('#111113', '#111113', 'Inter, sans-serif', '#f5f5f5', 0.072, 700, 'Inter, sans-serif', '#f5f5f5', '#1c1c1f', '#3a3a40', 0.05, 700, true, true, 0.01, 0.04, 0.24, 0.11),
  'minimal-white': recipe('#ffffff', '#ffffff', 'Inter, sans-serif', '#1a1a1a', 0.064, 600, 'Inter, sans-serif', '#1a1a1a', '#00000000', '#00000000', 0.044, 600, true, true, 0, 0.02, 0.22, 0.1),
  cinematic: recipe('#050505', '#141414', 'Bebas Neue, sans-serif', '#f5f5f5', 0.11, 400, 'Bebas Neue, sans-serif', '#ffffff', '#000000', '#ffffff', 0.07, 400, true, true, 0, 0.04, 0.3, 0.13),
  'bold-youtube': recipe('#0a0a0a', '#0a0a0a', 'Anton, sans-serif', '#ffffff', 0.09, 400, 'Anton, sans-serif', '#111111', '#f5c518', '#f5c518', 0.086, 400, true, true, 0.016, 0.02, 0.38, 0.16),
  'clean-artwork': recipe('#000000', '#000000', 'Inter, sans-serif', '#ffffff', 0.07, 700, 'Inter, sans-serif', '#ffffff', '#000000', '#000000', 0.05, 700, false, false, 0, 0, 0.24, 0.11),
  nature: recipe('#1b2e24', '#24382c', 'Montserrat, sans-serif', '#e6f2e4', 0.066, 700, 'Montserrat, sans-serif', '#e7f0e4', '#2f4a3c', '#8fb59a', 0.046, 700, true, true, 0.02, 0.04, 0.28, 0.11),
  seasonal: recipe('#2a1810', '#d4782a', 'Oswald, sans-serif', '#f4e6d4', 0.075, 600, 'Oswald, sans-serif', '#f4e6d4', '#3a2414', '#d4782a', 0.052, 600, true, true, 0.012, 0.05, 0.28, 0.12),
})

function recipe(
  background: string,
  background2: string,
  titleFont: string,
  titleColor: string,
  titleSize: number,
  titleWeight: number,
  badgeFont: string,
  badgeColor: string,
  badgeFill: string,
  badgeBorder: string,
  badgeSize: number,
  badgeWeight: number,
  showTitle: boolean,
  showBadges: boolean,
  radius: number,
  letterSpacing: number,
  qualityWidth: number,
  badgeHeight: number,
): TemplateRecipe {
  return Object.freeze({
    background,
    background2,
    backgroundFill: background === background2 ? 'solid' : 'gradient',
    titleFont,
    titleColor,
    titleSize,
    titleWeight,
    badgeFont,
    badgeColor,
    badgeFill,
    badgeBorder,
    badgeSize,
    badgeWeight,
    showTitle,
    showBadges,
    radius,
    letterSpacing,
    qualityWidth,
    badgeHeight,
  })
}

export function isTemplateId(value: unknown): value is TemplateId {
  return THUMBNAIL_TEMPLATES.some((item) => item.id === value)
}

export function createThumbnailId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  return `thumb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function defaultTextStyle(): TextStyle {
  return {
    fontFamily: 'Inter, sans-serif',
    fontSize: 0.06,
    fontWeight: 700,
    letterSpacing: 0.04,
    lineHeight: 1.1,
    align: 'center',
    color: '#f5f5f5',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 0,
  }
}

export function defaultBoxStyle(): BoxStyle {
  return {
    fill: 'solid',
    color: '#1c1c1f',
    color2: '#1c1c1f',
    fillOpacity: 1,
    radius: 0.01,
    borderColor: '#3a3a40',
    borderWidth: 0,
    padding: 0.012,
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 0,
    glowColor: '#00000000',
    glowBlur: 0,
  }
}

function layer(partial: Pick<ThumbnailLayer, 'kind' | 'name' | 'z'> & Partial<ThumbnailLayer>): ThumbnailLayer {
  const { textStyle, boxStyle, crop, ...rest } = partial
  return {
    id: createThumbnailId(),
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    anchor: 'top-left',
    assetId: null,
    text: '',
    userEdited: false,
    textRole: null,
    badgeRole: null,
    contentBadge: null,
    fit: 'cover',
    sourceWidth: 0,
    sourceHeight: 0,
    blur: 0,
    composition: null,
    ...rest,
    locked: partial.locked ?? partial.kind === 'background',
    textStyle: { ...defaultTextStyle(), ...textStyle },
    boxStyle: { ...defaultBoxStyle(), ...boxStyle },
    crop: crop ? { ...crop } : fullNormCrop(),
  }
}

function badgeLayer(role: BadgeRole, name: string, z: number, anchor: FixedAnchor, width: number): ThumbnailLayer {
  const point = anchorPoint(anchor, 0.05)
  return layer({
    kind: 'badge',
    name,
    z,
    badgeRole: role,
    contentBadge: role === 'content' ? 'custom' : null,
    anchor,
    x: point.x,
    y: point.y,
    width,
    height: 0.12,
    visible: role !== 'content',
    text: role === 'content' ? 'CUSTOM' : '',
  })
}

function baseLayers(name: string): ThumbnailLayer[] {
  return [
    layer({ kind: 'background', name: 'Background', z: 0, locked: true }),
    layer({ kind: 'artwork', name: 'Artwork', z: 10, locked: true, fit: 'cover' }),
    layer({ kind: 'frame', name: 'Frame', z: 20, visible: false, locked: true }),
    badgeLayer('quality', 'Quality', 30, 'top-right', 0.24),
    badgeLayer('duration', 'Duration', 31, 'bottom-left', 0.32),
    badgeLayer('content', 'Content', 32, 'top-left', 0.34),
    layer({
      kind: 'text',
      name: 'Title',
      z: 40,
      textRole: 'title',
      text: name,
      anchor: 'bottom-center',
      x: 0.5,
      y: anchorPoint('bottom-center', 0.05).y,
      width: 0.86,
      height: 0.16,
    }),
  ]
}

export function createThumbnailProject(name = 'Untitled thumbnail'): ThumbnailProject {
  const project: ThumbnailProject = {
    version: 1,
    id: createThumbnailId(),
    name,
    templateId: 'modern-dark',
    season: 'autumn',
    width: 1280,
    height: 720,
    aspect: '16:9',
    linkMode: 'snapshot',
    sourceApp: 'standalone',
    sourceProjectId: null,
    returnPath: null,
    videoWidth: null,
    videoHeight: null,
    durationSeconds: null,
    durationOverride: null,
    qualityOverride: null,
    safeMargin: 0.05,
    snapGrid: 0.02,
    snapCenter: true,
    showGuides: true,
    showSafeArea: false,
    autoContrast: false,
    autoLayout: false,
    layers: baseLayers(name),
    updatedAt: 0,
  }
  return applyTemplate(project, 'modern-dark')
}

function recipeFor(id: TemplateId, season: SeasonId): TemplateRecipe {
  const base = { ...TEMPLATE_RECIPES[id] }
  if (id !== 'seasonal') return base
  const colors = SEASONS[season]
  return {
    ...base,
    background: colors.background,
    background2: colors.accent,
    backgroundFill: 'gradient',
    titleColor: colors.text,
    badgeColor: colors.text,
    badgeFill: colors.badge,
    badgeBorder: colors.border,
  }
}

function paintBadgeStyle(target: ThumbnailLayer, style: TemplateRecipe, width: number): void {
  const anchor = target.anchor === 'free' ? 'top-right' : target.anchor
  const fixed = (ANCHOR_IDS as readonly string[]).includes(anchor) ? (anchor as FixedAnchor) : 'top-right'
  const point = anchorPoint(fixed, 0.05)
  target.anchor = fixed
  target.x = point.x
  target.y = point.y
  target.width = width
  target.height = style.badgeHeight
  target.textStyle = {
    ...target.textStyle,
    fontFamily: style.badgeFont,
    fontSize: style.badgeSize,
    fontWeight: style.badgeWeight,
    letterSpacing: style.letterSpacing,
    color: style.badgeColor,
    align: 'center',
  }
  const transparent = style.badgeFill === '#00000000'
  target.boxStyle = {
    ...target.boxStyle,
    fill: transparent ? 'none' : 'solid',
    color: transparent ? '#000000' : style.badgeFill,
    color2: style.badgeFill,
    fillOpacity: transparent ? 0 : 0.94,
    radius: style.radius,
    borderColor: style.badgeBorder === '#00000000' ? '#000000' : style.badgeBorder,
    borderWidth: style.badgeBorder === '#00000000' ? 0 : 0.003,
    padding: 0.012,
  }
}

export function applyTemplate(project: ThumbnailProject, templateId: TemplateId): ThumbnailProject {
  const next = cloneData(project)
  next.templateId = templateId
  const style = recipeFor(templateId, next.season)
  const background = next.layers.find((item) => item.kind === 'background')
  if (background) {
    background.boxStyle = {
      ...background.boxStyle,
      fill: style.backgroundFill,
      color: style.background,
      color2: style.background2,
      fillOpacity: 1,
    }
    background.blur = 0
    background.visible = true
  }
  const title = next.layers.find((item) => item.textRole === 'title')
  if (title) {
    title.visible = style.showTitle
    if (!title.userEdited) title.text = next.name
    title.textStyle = {
      ...title.textStyle,
      fontFamily: style.titleFont,
      fontSize: style.titleSize,
      fontWeight: style.titleWeight,
      letterSpacing: style.letterSpacing,
      color: style.titleColor,
      align: 'center',
    }
    title.anchor = 'bottom-center'
    title.x = 0.5
    title.y = anchorPoint('bottom-center', next.safeMargin).y
    title.width = 0.86
    title.height = Math.max(0.14, style.titleSize * 2.2)
  }
  const quality = next.layers.find((item) => item.badgeRole === 'quality')
  const duration = next.layers.find((item) => item.badgeRole === 'duration')
  const content = next.layers.find((item) => item.badgeRole === 'content')
  if (quality) {
    paintBadgeStyle(quality, style, style.qualityWidth)
    quality.anchor = 'top-right'
    const point = anchorPoint('top-right', next.safeMargin)
    quality.x = point.x
    quality.y = point.y
    quality.visible = style.showBadges
  }
  if (duration) {
    paintBadgeStyle(duration, style, Math.min(0.46, style.qualityWidth + 0.08))
    duration.anchor = 'bottom-left'
    const point = anchorPoint('bottom-left', next.safeMargin)
    duration.x = point.x
    duration.y = point.y
    duration.visible = style.showBadges && next.durationSeconds != null
  }
  if (content) {
    paintBadgeStyle(content, style, Math.min(0.46, style.qualityWidth + 0.1))
    content.anchor = 'top-left'
    const point = anchorPoint('top-left', next.safeMargin)
    content.x = point.x
    content.y = point.y
    if (!style.showBadges) content.visible = false
  }
  next.updatedAt = Date.now()
  return next
}

export function setSeason(project: ThumbnailProject, season: SeasonId): ThumbnailProject {
  const next = cloneData(project)
  next.season = season
  if (next.templateId === 'seasonal') return applyTemplate(next, 'seasonal')
  next.updatedAt = Date.now()
  return next
}

export function sizeForAspect(width: number, aspect: ThumbnailAspect, height = width): { width: number; height: number } {
  const w = clampSize(width)
  if (aspect === '16:9') return { width: w, height: clampSize(Math.round(w * 9 / 16)) }
  if (aspect === '1:1') return { width: w, height: w }
  if (aspect === '9:16') return { width: w, height: clampSize(Math.round(w * 16 / 9)) }
  return { width: w, height: clampSize(height) }
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return 720
  return Math.max(16, Math.min(7680, Math.round(value)))
}

export function setOutputSize(project: ThumbnailProject, width: number, height: number, aspect?: ThumbnailAspect): ThumbnailProject {
  const next = cloneData(project)
  const resolvedAspect = aspect ?? inferAspect(width, height)
  const size = sizeForAspect(width, resolvedAspect, height)
  next.width = size.width
  next.height = size.height
  next.aspect = resolvedAspect
  next.updatedAt = Date.now()
  return next
}

function inferAspect(width: number, height: number): ThumbnailAspect {
  if (height <= 0) return 'custom'
  const ratio = width / height
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9'
  if (Math.abs(ratio - 1) < 0.02) return '1:1'
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16'
  return 'custom'
}

export function exactExportSize(width: number, height: number): { width: number; height: number } {
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
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

const QUALITY_RANK: Record<Exclude<QualityId, 'custom'>, number> = {
  '720': 1,
  '1080': 2,
  '1440': 3,
  '4k': 4,
  '8k': 5,
}

export function qualityFromResolution(width: number, height: number): { id: QualityId; label: string } {
  const short = Math.min(Math.max(0, width), Math.max(0, height))
  if (short >= 4320) return { id: '8k', label: '8K UHD' }
  if (short >= 2160) return { id: '4k', label: '4K UHD' }
  if (short >= 1440) return { id: '1440', label: '1440P' }
  if (short >= 1080) return { id: '1080', label: '1080P' }
  if (short >= 720) return { id: '720', label: '720P' }
  if (short > 0) return { id: 'custom', label: `${Math.round(short)}P` }
  return { id: 'custom', label: '' }
}

export function qualityIdFromLabel(label: string): QualityId | null {
  const found = QUALITY_OPTIONS.find((item) => item.label.toLowerCase() === label.trim().toLowerCase())
  return found?.id ?? null
}

export function clampQualityChoice(choice: QualityId, derived: QualityId): QualityId {
  if (choice === 'custom' || derived === 'custom') return derived === 'custom' ? 'custom' : choice === 'custom' ? 'custom' : choice
  if (QUALITY_RANK[choice] > QUALITY_RANK[derived]) return derived
  return choice
}

export function sanitizeQualityOverride(label: string | null, width: number, height: number): string | null {
  if (!label || !label.trim()) return null
  const trimmed = label.trim().slice(0, 24)
  const id = qualityIdFromLabel(trimmed)
  const derived = qualityFromResolution(width, height)
  if (!id || id === 'custom') {
    if (id === 'custom') return null
    const posing = qualityIdFromLabel(trimmed.toUpperCase())
    if (posing && posing !== 'custom' && clampQualityChoice(posing, derived.id) !== posing) return null
    return trimmed
  }
  const clamped = clampQualityChoice(id, derived.id)
  if (clamped !== id) return null
  if (clamped === derived.id) return null
  return QUALITY_OPTIONS.find((item) => item.id === clamped)?.label ?? null
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

export function badgeLabel(project: ThumbnailProject, layer: ThumbnailLayer): string {
  if (layer.badgeRole === 'quality') {
    const width = project.videoWidth ?? project.width
    const height = project.videoHeight ?? project.height
    const override = sanitizeQualityOverride(project.qualityOverride, width, height)
    if (override) return override
    return qualityFromResolution(width, height).label
  }
  if (layer.badgeRole === 'duration') {
    if (project.durationOverride && project.durationOverride.trim()) return project.durationOverride.trim().slice(0, 32)
    if (project.durationSeconds == null) return ''
    return formatBadgeDuration(project.durationSeconds)
  }
  if (layer.badgeRole === 'content') {
    if (layer.contentBadge === 'custom') return layer.text.trim()
    return CONTENT_BADGES.find((item) => item.id === layer.contentBadge)?.label ?? ''
  }
  return layer.text
}

export function assetIdsInProject(project: ThumbnailProject): string[] {
  const ids = new Set<string>()
  for (const item of project.layers) {
    if (item.assetId) ids.add(item.assetId)
  }
  return [...ids]
}

export function missingAssetIds(project: ThumbnailProject, knownIds: string[]): string[] {
  const known = new Set(knownIds)
  return assetIdsInProject(project).filter((id) => !known.has(id))
}

export function layersInDrawOrder(layers: ThumbnailLayer[]): ThumbnailLayer[] {
  return [...layers].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id))
}

export function isMovableLayer(layer: ThumbnailLayer): boolean {
  return layer.kind === 'text' || layer.kind === 'badge' || layer.kind === 'image' || layer.kind === 'shape'
}

export function reorderLayer(layers: ThumbnailLayer[], id: string, direction: -1 | 1): ThumbnailLayer[] {
  const sorted = layersInDrawOrder(layers)
  const index = sorted.findIndex((item) => item.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= sorted.length) return layers
  const copy = sorted.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  const zById = new Map(copy.map((entry, entryIndex) => [entry.id, entryIndex]))
  return layers.map((entry) => ({ ...entry, z: zById.get(entry.id) ?? entry.z }))
}

export function hitTestLayer(layers: ThumbnailLayer[], x: number, y: number): ThumbnailLayer | null {
  const ordered = layersInDrawOrder(layers).reverse()
  for (const item of ordered) {
    if (!item.visible || item.locked || !isMovableLayer(item)) continue
    const box = layerBox(item)
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) return item
  }
  return null
}

export function nudgeLayer(item: ThumbnailLayer, dx: number, dy: number, grid: number, snapCenter: boolean): ThumbnailLayer {
  const box = layerBox(item)
  const x = snapNorm(box.x + box.width / 2 + dx, grid, snapCenter)
  const y = snapNorm(box.y + box.height / 2 + dy, grid, snapCenter)
  return { ...item, anchor: 'free', x, y }
}

export function placeLayerAtAnchor(item: ThumbnailLayer, anchor: FixedAnchor, margin: number): ThumbnailLayer {
  const point = anchorPoint(anchor, margin)
  return { ...item, anchor, x: point.x, y: point.y }
}

export function alignLayerSelection(
  layers: ThumbnailLayer[],
  ids: string[],
  edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
): ThumbnailLayer[] {
  const selected = layers.filter((item) => ids.includes(item.id) && !item.locked && isMovableLayer(item))
  if (selected.length < 2) return layers
  const boxes = selected.map((item) => ({ id: item.id, box: layerBox(item) }))
  const minX = Math.min(...boxes.map((item) => item.box.x))
  const minY = Math.min(...boxes.map((item) => item.box.y))
  const maxX = Math.max(...boxes.map((item) => item.box.x + item.box.width))
  const maxY = Math.max(...boxes.map((item) => item.box.y + item.box.height))
  const updates = new Map<string, ThumbnailLayer>()
  for (const entry of boxes) {
    const item = selected.find((layerItem) => layerItem.id === entry.id)
    if (!item) continue
    let x = entry.box.x
    let y = entry.box.y
    if (edge === 'left') x = minX
    if (edge === 'right') x = maxX - entry.box.width
    if (edge === 'center') x = (minX + maxX) / 2 - entry.box.width / 2
    if (edge === 'top') y = minY
    if (edge === 'bottom') y = maxY - entry.box.height
    if (edge === 'middle') y = (minY + maxY) / 2 - entry.box.height / 2
    updates.set(entry.id, { ...item, anchor: 'free', x: x + entry.box.width / 2, y: y + entry.box.height / 2 })
  }
  return layers.map((item) => updates.get(item.id) ?? item)
}

export function layerBox(item: Pick<ThumbnailLayer, 'anchor' | 'x' | 'y' | 'width' | 'height'>) {
  return topLeftFromAnchor(item.anchor, item.x, item.y, item.width, item.height)
}

export function patchLayer(
  project: ThumbnailProject,
  id: string,
  patch: Partial<Omit<ThumbnailLayer, 'textStyle' | 'boxStyle' | 'crop'>> & {
    textStyle?: Partial<TextStyle>
    boxStyle?: Partial<BoxStyle>
    crop?: Partial<NormCrop>
  },
): ThumbnailProject {
  const next = cloneData(project)
  next.layers = next.layers.map((item) => {
    if (item.id !== id) return item
    const { textStyle, boxStyle, crop, ...rest } = patch
    return {
      ...item,
      ...rest,
      textStyle: textStyle ? { ...item.textStyle, ...textStyle } : item.textStyle,
      boxStyle: boxStyle ? { ...item.boxStyle, ...boxStyle } : item.boxStyle,
      crop: crop ? { ...item.crop, ...crop } : item.crop,
    }
  })
  next.updatedAt = Date.now()
  return next
}

export function addTextLayer(project: ThumbnailProject, text = 'Text'): ThumbnailProject {
  const next = cloneData(project)
  const point = anchorPoint('center', 0)
  next.layers.push(
    layer({
      kind: 'text',
      name: 'Text',
      z: nextZ(next.layers),
      textRole: 'custom',
      text,
      userEdited: true,
      anchor: 'center',
      x: point.x,
      y: point.y,
      width: 0.5,
      height: 0.12,
    }),
  )
  next.updatedAt = Date.now()
  return next
}

export function addShapeLayer(project: ThumbnailProject): ThumbnailProject {
  const next = cloneData(project)
  next.layers.push(
    layer({
      kind: 'shape',
      name: 'Shape',
      z: nextZ(next.layers),
      anchor: 'center',
      x: 0.5,
      y: 0.5,
      width: 0.22,
      height: 0.12,
      boxStyle: { ...defaultBoxStyle(), color: '#c6a15b', fillOpacity: 0.9 },
    }),
  )
  next.updatedAt = Date.now()
  return next
}

export function addImageLayer(project: ThumbnailProject, assetId: string, sourceWidth: number, sourceHeight: number): ThumbnailProject {
  const next = cloneData(project)
  next.layers.push(
    layer({
      kind: 'image',
      name: 'Image',
      z: nextZ(next.layers),
      assetId,
      sourceWidth,
      sourceHeight,
      anchor: 'center',
      x: 0.5,
      y: 0.5,
      width: 0.34,
      height: 0.34,
      fit: 'contain',
    }),
  )
  next.updatedAt = Date.now()
  return next
}

function nextZ(layers: ThumbnailLayer[]): number {
  return layers.reduce((max, item) => Math.max(max, item.z), 0) + 1
}

export function duplicateLayer(project: ThumbnailProject, id: string): ThumbnailProject {
  const source = project.layers.find((item) => item.id === id)
  if (!source || !isMovableLayer(source)) return project
  const next = cloneData(project)
  const copy = cloneData(source)
  copy.id = createThumbnailId()
  copy.name = `${source.name} copy`
  copy.z = nextZ(next.layers)
  const box = layerBox(source)
  copy.anchor = 'free'
  copy.x = box.x + box.width / 2 + 0.03
  copy.y = box.y + box.height / 2 + 0.03
  copy.userEdited = true
  next.layers.push(copy)
  next.updatedAt = Date.now()
  return next
}

export function removeLayers(project: ThumbnailProject, ids: string[]): ThumbnailProject {
  const next = cloneData(project)
  next.layers = next.layers.filter((item) => {
    if (!ids.includes(item.id)) return true
    return !(item.kind === 'image' || item.kind === 'shape' || (item.kind === 'text' && item.textRole === 'custom'))
  })
  next.updatedAt = Date.now()
  return next
}

export function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'thumbnail'
}

export function thumbnailFilename(
  name: string,
  templateId: string,
  width: number,
  height: number,
  ext: 'png' | 'jpeg' | 'webp',
): string {
  const extension = ext === 'jpeg' ? 'jpg' : ext
  return `${sanitizeFilenamePart(name)}-thumbnail-${sanitizeFilenamePart(templateId)}-${Math.round(width)}x${Math.round(height)}.${extension}`
}

export function catalogEntry(project: ThumbnailProject): ThumbnailCatalogEntry {
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    templateId: project.templateId,
    width: project.width,
    height: project.height,
  }
}

export function serializeProject(project: ThumbnailProject): string {
  return JSON.stringify(project)
}

export function parseProject(raw: unknown): ThumbnailProject | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ThumbnailProject>
  if (data.version !== 1 || typeof data.id !== 'string' || !Array.isArray(data.layers)) return null
  const fresh = createThumbnailProject(typeof data.name === 'string' ? data.name : 'Untitled thumbnail')
  fresh.id = data.id
  const merged = { ...fresh, ...data, version: 1 as const, layers: data.layers.map((item) => normalizeLayer(item)).filter((item): item is ThumbnailLayer => item != null) }
  if (!merged.layers.some((item) => item.kind === 'artwork')) return null
  if (!isTemplateId(merged.templateId)) merged.templateId = 'modern-dark'
  merged.width = clampSize(merged.width)
  merged.height = clampSize(merged.height)
  return merged
}

function normalizeLayer(raw: unknown): ThumbnailLayer | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ThumbnailLayer>
  if (typeof data.id !== 'string' || typeof data.kind !== 'string') return null
  const base = layer({ kind: 'shape', name: 'Layer', z: 0 })
  return {
    ...base,
    ...data,
    id: data.id,
    textStyle: { ...defaultTextStyle(), ...(data.textStyle ?? {}) },
    boxStyle: { ...defaultBoxStyle(), ...(data.boxStyle ?? {}) },
    crop: { ...fullNormCrop(), ...(data.crop ?? {}) },
  }
}

function matchPresetLayer(layerItem: ThumbnailLayer, presetLayer: PresetLayer): boolean {
  if (layerItem.kind !== presetLayer.kind) return false
  if (layerItem.badgeRole || presetLayer.badgeRole) return layerItem.badgeRole === presetLayer.badgeRole
  if (layerItem.textRole === 'title' || presetLayer.textRole === 'title') return layerItem.textRole === presetLayer.textRole
  return layerItem.kind === presetLayer.kind && layerItem.name === presetLayer.name
}

export function presetFromProject(project: ThumbnailProject, name: string, id = createThumbnailId()): ThumbnailPreset {
  return {
    version: 1,
    id,
    name: name.trim() || 'Preset',
    templateId: project.templateId,
    season: project.season,
    safeMargin: project.safeMargin,
    autoContrast: project.autoContrast,
    autoLayout: project.autoLayout,
    snapGrid: project.snapGrid,
    snapCenter: project.snapCenter,
    layers: project.layers
      .filter((item) => item.kind !== 'image')
      .map((item) => ({
        kind: item.kind,
        name: item.name,
        textRole: item.textRole,
        badgeRole: item.badgeRole,
        contentBadge: item.contentBadge,
        anchor: item.anchor,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        opacity: item.opacity,
        visible: item.visible,
        locked: item.locked,
        z: item.z,
        blur: item.kind === 'background' ? item.blur : 0,
        fit: item.fit,
        text: item.textRole === 'title' ? '' : item.text,
        textStyle: cloneData(item.textStyle),
        boxStyle: cloneData(item.boxStyle),
      })),
  }
}

export function applyPreset(project: ThumbnailProject, preset: ThumbnailPreset): ThumbnailProject {
  const next = cloneData(project)
  next.templateId = preset.templateId
  next.season = preset.season
  next.safeMargin = preset.safeMargin
  next.autoContrast = preset.autoContrast
  next.autoLayout = preset.autoLayout
  next.snapGrid = preset.snapGrid
  next.snapCenter = preset.snapCenter
  const images = next.layers.filter((item) => item.kind === 'image')
  const used = new Set<string>()
  const styled: ThumbnailLayer[] = []
  for (const presetLayer of preset.layers) {
    const existing = next.layers.find((item) => !used.has(item.id) && matchPresetLayer(item, presetLayer))
    if (existing) used.add(existing.id)
    const base = existing ?? layer({ kind: presetLayer.kind, name: presetLayer.name, z: presetLayer.z })
    styled.push({
      ...base,
      name: presetLayer.name,
      textRole: presetLayer.textRole,
      badgeRole: presetLayer.badgeRole,
      contentBadge: presetLayer.contentBadge,
      anchor: presetLayer.anchor,
      x: presetLayer.x,
      y: presetLayer.y,
      width: presetLayer.width,
      height: presetLayer.height,
      rotation: presetLayer.rotation,
      opacity: presetLayer.opacity,
      visible: presetLayer.visible,
      locked: presetLayer.locked,
      z: presetLayer.z,
      blur: presetLayer.kind === 'background' ? presetLayer.blur : base.blur,
      fit: presetLayer.fit,
      text: presetLayer.textRole === 'title' ? (base.userEdited ? base.text : next.name) : presetLayer.text || base.text,
      textStyle: cloneData(presetLayer.textStyle),
      boxStyle: cloneData(presetLayer.boxStyle),
      assetId: base.assetId,
      composition: base.composition,
      crop: base.crop,
      sourceWidth: base.sourceWidth,
      sourceHeight: base.sourceHeight,
    })
  }
  for (const item of next.layers) {
    if (!used.has(item.id) && item.kind !== 'image' && !preset.layers.some((presetLayer) => matchPresetLayer(item, presetLayer))) {
      styled.push(item)
    }
  }
  next.layers = [...styled, ...images]
  next.updatedAt = Date.now()
  return next
}

export function serializePreset(preset: ThumbnailPreset): string {
  return JSON.stringify(preset)
}

export function parsePreset(raw: unknown): { ok: true; preset: ThumbnailPreset } | { ok: false; error: string } {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw) as unknown
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' }
    }
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'That preset file is empty.' }
  const record = data as Partial<ThumbnailPreset>
  if (record.version !== 1) return { ok: false, error: 'This preset is from a newer Thumbnail Studio and cannot be imported.' }
  if (typeof record.name !== 'string' || !record.name.trim()) return { ok: false, error: 'The preset needs a name.' }
  if (!isTemplateId(record.templateId)) return { ok: false, error: 'The preset template is not recognized.' }
  if (!Array.isArray(record.layers) || record.layers.length === 0) return { ok: false, error: 'The preset has no layers.' }
  const preset = presetFromProject(createThumbnailProject(), record.name.trim(), typeof record.id === 'string' ? record.id : createThumbnailId())
  preset.templateId = record.templateId
  preset.season = record.season === 'winter' || record.season === 'holiday' || record.season === 'autumn' ? record.season : 'autumn'
  preset.safeMargin = Number.isFinite(record.safeMargin) ? Number(record.safeMargin) : 0.05
  preset.autoContrast = record.autoContrast === true
  preset.autoLayout = record.autoLayout === true
  preset.snapGrid = Number.isFinite(record.snapGrid) ? Number(record.snapGrid) : 0.02
  preset.snapCenter = record.snapCenter !== false
  preset.layers = record.layers.map((item) => normalizePresetLayer(item)).filter((item): item is PresetLayer => item != null)
  if (preset.layers.length === 0) return { ok: false, error: 'The preset layers could not be read.' }
  return { ok: true, preset }
}

function normalizePresetLayer(raw: unknown): PresetLayer | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<PresetLayer>
  if (typeof data.kind !== 'string' || typeof data.name !== 'string') return null
  const sample = layer({ kind: 'shape', name: data.name, z: 0 })
  return {
    kind: data.kind as LayerKind,
    name: data.name,
    textRole: data.textRole === 'title' || data.textRole === 'custom' ? data.textRole : null,
    badgeRole: data.badgeRole === 'quality' || data.badgeRole === 'duration' || data.badgeRole === 'content' ? data.badgeRole : null,
    contentBadge: CONTENT_BADGES.some((item) => item.id === data.contentBadge) ? (data.contentBadge as ContentBadgeId) : null,
    anchor: data.anchor === 'free' || (ANCHOR_IDS as readonly string[]).includes(String(data.anchor)) ? (data.anchor as AnchorId) : 'free',
    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    width: Number(data.width) || sample.width,
    height: Number(data.height) || sample.height,
    rotation: Number(data.rotation) || 0,
    opacity: Number.isFinite(data.opacity) ? Number(data.opacity) : 1,
    visible: data.visible !== false,
    locked: data.locked === true,
    z: Number(data.z) || 0,
    blur: Number(data.blur) || 0,
    fit: data.fit === 'contain' ? 'contain' : 'cover',
    text: typeof data.text === 'string' ? data.text : '',
    textStyle: { ...defaultTextStyle(), ...(data.textStyle ?? {}) },
    boxStyle: { ...defaultBoxStyle(), ...(data.boxStyle ?? {}) },
  }
}

export function deleteUserPreset(presets: ThumbnailPreset[], id: string): ThumbnailPreset[] {
  return presets.filter((item) => item.id !== id)
}

export function withArtworkSize(project: ThumbnailProject, width: number, height: number): ThumbnailProject {
  const artwork = artworkLayer(project)
  if (!artwork) return project
  return patchLayer(project, artwork.id, { sourceWidth: width, sourceHeight: height })
}

export function artworkLayer(project: ThumbnailProject): ThumbnailLayer | undefined {
  return project.layers.find((item) => item.kind === 'artwork')
}

export function frameLayer(project: ThumbnailProject): ThumbnailLayer | undefined {
  return project.layers.find((item) => item.kind === 'frame')
}
