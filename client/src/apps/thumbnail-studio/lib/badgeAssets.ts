import { badgeAssetFolder, resolveBadgeAssetSlug, stylePreviewBadgeSlug } from '@shared/thumbnailBadges'
import type { BadgeStyleId } from '@shared/thumbnailProject'

const svgModules = import.meta.glob('../../../assets/thumbnail-badges/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const urlByKey = new Map<string, string>()
for (const [filePath, url] of Object.entries(svgModules)) {
  const normalized = filePath.replace(/\\/g, '/')
  const marker = '/assets/thumbnail-badges/'
  const idx = normalized.indexOf(marker)
  if (idx === -1) continue
  urlByKey.set(normalized.slice(idx + marker.length), url)
}

export function badgeSvgUrl(styleId: BadgeStyleId, text: string): string | null {
  const slug = resolveBadgeAssetSlug(styleId, text)
  const folder = badgeAssetFolder(styleId)
  return urlByKey.get(`${folder}/${slug}.svg`) ?? urlByKey.get(`${folder}/4k-uhd.svg`) ?? urlByKey.get(`${folder}/4k.svg`) ?? null
}

export function stylePreviewSvgUrl(styleId: BadgeStyleId): string | null {
  const slug = stylePreviewBadgeSlug(styleId)
  const folder = badgeAssetFolder(styleId)
  return urlByKey.get(`${folder}/${slug}.svg`) ?? null
}

export const BADGE_WIDTH_RATIO = 0.2

/** Layout box (200×144 chip rect) used for anchor math; asset includes drop-shadow margin. */
export function badgeLayoutMetrics(styleId: BadgeStyleId): { assetW: number; assetH: number; contentW: number; contentH: number; padX: number; padY: number } {
  if (styleId === 'gold-plate' || styleId === 'silver-plate') {
    return { assetW: 232, assetH: 188.61, contentW: 200, contentH: 156.61, padX: 16, padY: 8 }
  }
  if (styleId === 'gold-stack' || styleId === 'silver-stack') {
    return { assetW: 232, assetH: 160, contentW: 200, contentH: 128, padX: 16, padY: 8 }
  }
  return { assetW: 232, assetH: 176, contentW: 200, contentH: 144, padX: 16, padY: 8 }
}
