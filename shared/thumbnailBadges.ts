import { parseDurationText, qualityFromResolution, qualityIdFromText, type BadgeStyleId, type ThumbnailDocument } from './thumbnailProject'

export const BADGE_ASSET_SLUGS = [
  '720p',
  '1080p',
  '2k', '2k-qhd',
  '4k', '4k-uhd',
  '8k', '8k-uhd',
  '30m', '30-min',
  '1h', '1-hour',
  '2h', '2-hours',
  '4h', '4-hours',
  '6h', '6-hours',
  '8h', '8-hours',
  '10h', '10-hours',
  '12h', '12-hours',
] as const

export type BadgeAssetSlug = (typeof BADGE_ASSET_SLUGS)[number]

export interface BadgeCatalogOption {
  label: string
  slug: BadgeAssetSlug
  chipSlug?: BadgeAssetSlug
}

export const RESOLUTION_BADGE_OPTIONS: readonly BadgeCatalogOption[] = [
  { label: '720P', slug: '720p' },
  { label: '1080P', slug: '1080p' },
  { label: '2K QHD', slug: '2k-qhd', chipSlug: '2k' },
  { label: '4K UHD', slug: '4k-uhd', chipSlug: '4k' },
  { label: '8K UHD', slug: '8k-uhd', chipSlug: '8k' },
]

export const DURATION_BADGE_OPTIONS: readonly BadgeCatalogOption[] = [
  { label: '30 MIN', slug: '30-min', chipSlug: '30m' },
  { label: '1 HOUR', slug: '1-hour', chipSlug: '1h' },
  { label: '2 HOURS', slug: '2-hours', chipSlug: '2h' },
  { label: '4 HOURS', slug: '4-hours', chipSlug: '4h' },
  { label: '6 HOURS', slug: '6-hours', chipSlug: '6h' },
  { label: '8 HOURS', slug: '8-hours', chipSlug: '8h' },
  { label: '10 HOURS', slug: '10-hours', chipSlug: '10h' },
  { label: '12 HOURS', slug: '12-hours', chipSlug: '12h' },
]

const CHIP = new Set<BadgeStyleId>(['gold', 'silver', 'outline', 'invert'])

function isChipStyle(styleId: BadgeStyleId): boolean {
  return CHIP.has(styleId)
}

function slugForOption(option: BadgeCatalogOption, styleId: BadgeStyleId): BadgeAssetSlug {
  if (isChipStyle(styleId) && option.chipSlug) return option.chipSlug
  return option.slug
}

function findResolutionOption(text: string): BadgeCatalogOption | null {
  const trimmed = text.trim()
  return RESOLUTION_BADGE_OPTIONS.find((item) => item.label.toUpperCase() === trimmed.toUpperCase()) ?? null
}

function findDurationOption(text: string): BadgeCatalogOption | null {
  const trimmed = text.trim()
  return DURATION_BADGE_OPTIONS.find((item) => item.label.toUpperCase() === trimmed.toUpperCase()) ?? null
}

/** Map editor badge text + style to the baked SVG filename slug. */
export function resolveBadgeAssetSlug(styleId: BadgeStyleId, text: string): BadgeAssetSlug {
  const resolution = findResolutionOption(text)
  if (resolution) return slugForOption(resolution, styleId)
  const duration = findDurationOption(text)
  if (duration) return slugForOption(duration, styleId)
  return isChipStyle(styleId) ? '4k' : '4k-uhd'
}

export function stylePreviewBadgeSlug(styleId: BadgeStyleId): BadgeAssetSlug {
  return isChipStyle(styleId) ? '4k' : '4k-uhd'
}

export function badgeAssetFolder(styleId: BadgeStyleId): string {
  switch (styleId) {
    case 'gold':
      return 'chips/gold'
    case 'silver':
      return 'chips/silver'
    case 'outline':
      return 'chips/outline'
    case 'invert':
      return 'chips/invert'
    case 'gold-plate':
      return 'plates/gold-plate'
    case 'silver-plate':
      return 'plates/silver-plate'
    case 'gold-stack':
      return 'stacks/gold-stack'
    case 'silver-stack':
      return 'stacks/silver-stack'
  }
}

export function normalizeResolutionBadgeText(text: string, width = 0, height = 0): string {
  const found = findResolutionOption(text)
  if (found) return found.label
  if (width > 0 && height > 0) {
    const quality = qualityFromResolution(width, height)
    const fromVideo = RESOLUTION_BADGE_OPTIONS.find((item) => item.label === quality.label)
    if (fromVideo) return fromVideo.label
    if (quality.id === '1440') return '1080P'
  }
  const id = qualityIdFromText(text)
  const byId: Record<string, string> = {
    '720': '720P',
    '1080': '1080P',
    '1440': '1080P',
    '4k': '4K UHD',
    '8k': '8K UHD',
    custom: '4K UHD',
  }
  return byId[id] ?? '4K UHD'
}

export function nearestDurationBadgeLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return DURATION_BADGE_OPTIONS[2].label
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const candidates = DURATION_BADGE_OPTIONS.map((item) => {
    const parsed = parseDurationText(item.label)
    const minutes = parsed ? parsed.hours * 60 + parsed.minutes : 0
    return { label: item.label, minutes }
  })
  let best = candidates[0]
  let bestDiff = Math.abs(candidates[0].minutes - totalMinutes)
  for (const item of candidates.slice(1)) {
    const diff = Math.abs(item.minutes - totalMinutes)
    if (diff < bestDiff) {
      best = item
      bestDiff = diff
    }
  }
  return best.label
}

export function normalizeDurationBadgeText(text: string, durationSeconds: number | null = null): string {
  const found = findDurationOption(text)
  if (found) return found.label
  if (durationSeconds != null && durationSeconds > 0) return nearestDurationBadgeLabel(durationSeconds)
  const parsed = parseDurationText(text)
  if (parsed) return nearestDurationBadgeLabel((parsed.hours * 60 + parsed.minutes) * 60)
  return DURATION_BADGE_OPTIONS[2].label
}

export function normalizeThumbnailBadgeLabels(doc: ThumbnailDocument): ThumbnailDocument {
  const resolutionText = normalizeResolutionBadgeText(doc.resolution.text, doc.source.videoWidth ?? 0, doc.source.videoHeight ?? 0)
  const durationText = normalizeDurationBadgeText(doc.duration.text, doc.source.durationSeconds)
  if (resolutionText === doc.resolution.text && durationText === doc.duration.text) return doc
  return {
    ...doc,
    resolution: { ...doc.resolution, text: resolutionText },
    duration: { ...doc.duration, text: durationText },
  }
}
