import { clampBadgeScale, type BadgeStyleId } from '@shared/thumbnailProject'
import { badgeLayoutMetrics, badgeSvgUrl } from './badgeAssets'

export interface RasterBadge {
  canvas: HTMLCanvasElement
  padX: number
  padY: number
  contentWidth: number
  contentHeight: number
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()

function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(url)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load badge SVG: ${url}`))
      img.src = url
    })
    imageCache.set(url, pending)
  }
  return pending
}

export async function rasterizeBadge(styleId: BadgeStyleId, text: string, referenceWidth: number, scale = 1): Promise<RasterBadge | null> {
  const trimmed = text.trim()
  if (!trimmed || typeof document === 'undefined') return null
  const url = badgeSvgUrl(styleId, trimmed)
  if (!url) return null
  const layout = badgeLayoutMetrics(styleId)
  const reference = Math.max(48, Math.round(referenceWidth))
  const safe = clampBadgeScale(scale)
  const contentWidth = Math.max(1, Math.round(reference * safe))
  const contentHeight = Math.max(1, Math.round(contentWidth * (layout.contentH / layout.contentW)))
  const assetScale = contentWidth / layout.contentW
  const assetW = Math.ceil(layout.assetW * assetScale)
  const assetH = Math.ceil(layout.assetH * assetScale)
  const padX = Math.ceil(layout.padX * assetScale)
  const padY = Math.ceil(layout.padY * assetScale)
  const img = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = assetW
  canvas.height = assetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, assetW, assetH)
  return { canvas, padX, padY, contentWidth, contentHeight }
}
