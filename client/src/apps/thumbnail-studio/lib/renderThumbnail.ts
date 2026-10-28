import { sanitizeComposition } from '@shared/screensaverComposition'
import { anchorFactors } from '@shared/thumbnailLayout'
import { badgeAnchorPoint, exactExportSize, previewPixelSize, THUMBNAIL_CANVAS_COLOR, type ThumbnailDocument } from '@shared/thumbnailProject'
import { bakePlacement, paintComposition } from '../../frame-screensaver/lib/composeCanvas'
import { BADGE_WIDTH_RATIO } from './badgeAssets'
import { rasterizeBadge } from './rasterizeBadge'

export interface ThumbnailBitmap {
  source: CanvasImageSource
  width: number
  height: number
}

export interface ThumbnailRenderAssets {
  byId: Record<string, ThumbnailBitmap | undefined>
}

export interface RenderThumbnailOptions {
  preview?: boolean
  flatten?: boolean
}

let previewBase: { key: string; canvas: HTMLCanvasElement } | null = null

export async function ensureThumbnailFonts(): Promise<void> {
  const faces = [
    '400 64px Anton',
    '400 64px "Bebas Neue"',
    '400 64px Oswald',
    '700 64px Oswald',
    '400 64px Inter',
    '700 64px Inter',
    '400 64px Montserrat',
    '700 64px Montserrat',
    '800 64px Montserrat',
  ]
  await Promise.all(faces.map((face) => document.fonts.load(face).catch(() => [])))
  await document.fonts.ready
}

export function renderThumbnail(
  doc: ThumbnailDocument,
  assets: ThumbnailRenderAssets,
  options: RenderThumbnailOptions = {},
): HTMLCanvasElement {
  const size = options.preview
    ? previewPixelSize(doc.export.width, doc.export.height)
    : exactExportSize(doc.export.width, doc.export.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the thumbnail.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const base = baseCanvas(doc, assets, size.width, size.height, options)
  ctx.drawImage(base, 0, 0)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export the thumbnail.'))
    }, type, quality)
  })
}

export async function exportThumbnailBlob(doc: ThumbnailDocument, assets: ThumbnailRenderAssets): Promise<Blob> {
  await ensureThumbnailFonts()
  const jpeg = doc.export.format === 'jpeg'
  const rendered = renderThumbnail(doc, assets, { preview: false, flatten: jpeg })
  const ctx = rendered.getContext('2d')
  if (ctx) await paintBadges(ctx, doc)
  const source = jpeg ? flattenCanvas(rendered, THUMBNAIL_CANVAS_COLOR) : rendered
  return canvasToBlob(source, jpeg ? 'image/jpeg' : 'image/png', jpeg ? doc.export.jpegQuality : undefined)
}

async function paintBadges(ctx: CanvasRenderingContext2D, doc: ThumbnailDocument): Promise<void> {
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  for (const badge of [doc.resolution, doc.duration]) {
    if (!badge.enabled || !badge.text.trim()) continue
    const raster = await rasterizeBadge(badge.appearance.styleId, badge.text, Math.max(48, width * BADGE_WIDTH_RATIO), badge.appearance.scale)
    if (!raster) continue
    const point = badgeAnchorPoint(badge, doc.export.width, doc.export.height)
    const anchor = badge.anchor === 'free' || badge.deliberate ? 'free' : badge.anchor
    const { ax, ay } = anchorFactors(anchor)
    const x = point.x * width - raster.contentWidth * ax - raster.padX
    const y = point.y * height - raster.contentHeight * ay - raster.padY
    ctx.drawImage(raster.canvas, x, y)
  }
}

function baseCanvas(
  doc: ThumbnailDocument,
  assets: ThumbnailRenderAssets,
  width: number,
  height: number,
  options: RenderThumbnailOptions,
): HTMLCanvasElement {
  const key = `${width}x${height}|${options.flatten ? 1 : 0}|${baseSignature(doc, assets)}`
  if (options.preview && previewBase?.key === key) return previewBase.canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const art = doc.image.assetId ? assets.byId[doc.image.assetId] : undefined
  const composition = sanitizeComposition(doc.image.composition)
  const frame = doc.image.frameAssetId ? assets.byId[doc.image.frameAssetId]?.source ?? null : null
  if (composition && art) {
    const baked = bakePlacement(art.source, art.width, art.height, composition, width, height, false)
    paintComposition(ctx, baked, art.source, art.width, art.height, composition, {
      flatten: options.flatten === true,
      checker: false,
      frame,
    })
  } else {
    paintManualBase(ctx, doc, art, frame)
  }
  if (doc.image.assetId && !art) paintMissing(ctx, width, height)
  if (options.preview) previewBase = { key, canvas }
  return canvas
}

function baseSignature(doc: ThumbnailDocument, assets: ThumbnailRenderAssets): string {
  const artId = doc.image.assetId
  const frameId = doc.image.frameAssetId
  return JSON.stringify({
    art: artId,
    hasArt: Boolean(artId && assets.byId[artId]),
    frame: frameId,
    hasFrame: Boolean(frameId && assets.byId[frameId]),
    composition: doc.image.composition,
    crop: doc.image.crop,
    fit: doc.image.fit,
  })
}

function paintManualBase(
  ctx: CanvasRenderingContext2D,
  doc: ThumbnailDocument,
  art: ThumbnailBitmap | undefined,
  frame: CanvasImageSource | null,
): void {
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  ctx.fillStyle = THUMBNAIL_CANVAS_COLOR
  ctx.fillRect(0, 0, width, height)
  if (art) drawFitted(ctx, art, doc.image.crop, doc.image.fit, 0, 0, width, height)
  if (frame) ctx.drawImage(frame, 0, 0, width, height)
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  bitmap: ThumbnailBitmap,
  crop: { x: number; y: number; w: number; h: number },
  fit: 'contain' | 'cover',
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const sx = crop.x * bitmap.width
  const sy = crop.y * bitmap.height
  const sw = Math.max(1, crop.w * bitmap.width)
  const sh = Math.max(1, crop.h * bitmap.height)
  const scale = fit === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh)
  const tw = sw * scale
  const th = sh * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, dw, dh)
  ctx.clip()
  ctx.drawImage(bitmap.source, sx, sy, sw, sh, dx + (dw - tw) / 2, dy + (dh - th) / 2, tw, th)
  ctx.restore()
}

function flattenCanvas(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0)
  return canvas
}

function paintMissing(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save()
  ctx.fillStyle = '#a1a1aa'
  ctx.font = '600 16px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Image unavailable', width / 2, height / 2)
  ctx.restore()
}
