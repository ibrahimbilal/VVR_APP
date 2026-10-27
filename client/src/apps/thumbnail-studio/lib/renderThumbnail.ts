import { sanitizeComposition } from '@shared/screensaverComposition'
import { contrastPair, type FixedAnchor } from '@shared/thumbnailLayout'
import {
  artworkLayer,
  badgeLabel,
  exactExportSize,
  frameLayer,
  layersInDrawOrder,
  layerBox,
  previewPixelSize,
  type ThumbnailLayer,
  type ThumbnailProject,
} from '@shared/thumbnailProject'
import { bakePlacement, paintComposition } from '../../frame-screensaver/lib/composeCanvas'

export interface ThumbnailBitmap {
  source: CanvasImageSource
  width: number
  height: number
}

export interface ThumbnailRenderAssets {
  byId: Record<string, ThumbnailBitmap | undefined>
}

export interface RenderThumbnailOptions {
  maxEdge?: number | null
  checker?: boolean
  flatten?: boolean
  safeArea?: boolean
  guides?: { vertical: boolean; horizontal: boolean }
  selectedIds?: string[]
  skipOverlay?: boolean
}

const OVERLAY_KINDS = new Set(['text', 'badge', 'image', 'shape'])
let previewBase: { key: string; canvas: HTMLCanvasElement } | null = null

export async function ensureThumbnailFonts(): Promise<void> {
  const faces = [
    '400 80px Anton',
    '500 64px Oswald',
    '700 64px Oswald',
    '400 80px "Bebas Neue"',
    '700 64px Montserrat',
    '800 64px Montserrat',
    '400 32px Inter',
    '600 32px Inter',
    '700 64px Inter',
  ]
  await Promise.all(faces.map((face) => document.fonts.load(face).catch(() => [])))
  await document.fonts.ready
}

export function renderThumbnail(
  project: ThumbnailProject,
  assets: ThumbnailRenderAssets,
  options: RenderThumbnailOptions = {},
): HTMLCanvasElement {
  const size = options.maxEdge == null ? exactExportSize(project.width, project.height) : previewPixelSize(project.width, project.height, options.maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the thumbnail.')
  const base = baseCanvas(project, assets, size.width, size.height, options)
  ctx.drawImage(base, 0, 0)
  if (!options.skipOverlay) paintOverlays(ctx, project, assets, options)
  paintChrome(ctx, project, options)
  return canvas
}

export function sampleAnchorLuminance(canvas: HTMLCanvasElement, margin: number): Partial<Record<FixedAnchor, number>> {
  const ctx = canvas.getContext('2d')
  if (!ctx) return {}
  const anchors: FixedAnchor[] = [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]
  const result: Partial<Record<FixedAnchor, number>> = {}
  for (const anchor of anchors) {
    const x = anchor.endsWith('left') ? margin : anchor.endsWith('right') ? 1 - margin - 0.12 : 0.44
    const y = anchor.startsWith('top') ? margin : anchor.startsWith('bottom') ? 1 - margin - 0.08 : 0.46
    result[anchor] = averageLuminance(ctx, x * canvas.width, y * canvas.height, canvas.width * 0.12, canvas.height * 0.08)
  }
  return result
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export the thumbnail.'))
    }, type, quality)
  })
}

export async function exportThumbnailBlob(
  project: ThumbnailProject,
  assets: ThumbnailRenderAssets,
  format: 'png' | 'jpeg' | 'webp',
  quality = 0.92,
): Promise<Blob> {
  const rendered = renderThumbnail(project, assets, { checker: false, flatten: format === 'jpeg', safeArea: false })
  const type = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'
  const source = format === 'jpeg' ? flattenCanvas(rendered, jpegFill(project)) : rendered
  return canvasToBlob(source, type, format === 'png' ? undefined : quality)
}

function baseCanvas(
  project: ThumbnailProject,
  assets: ThumbnailRenderAssets,
  width: number,
  height: number,
  options: RenderThumbnailOptions,
): HTMLCanvasElement {
  const key = `${width}x${height}|${options.checker ? 1 : 0}|${options.flatten ? 1 : 0}|${baseSignature(project, assets)}`
  if (options.maxEdge != null && previewBase?.key === key) return previewBase.canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const artwork = artworkLayer(project)
  const composition = artwork ? sanitizeComposition(artwork.composition) : null
  const artBitmap = artwork?.assetId ? assets.byId[artwork.assetId] : undefined
  const frame = frameLayer(project)
  const frameBitmap = frame?.visible && frame.assetId ? assets.byId[frame.assetId]?.source ?? null : null
  if (composition && artBitmap) {
    const baked = bakePlacement(artBitmap.source, artBitmap.width, artBitmap.height, composition, width, height, false)
    paintComposition(ctx, baked, artBitmap.source, artBitmap.width, artBitmap.height, composition, {
      flatten: options.flatten === true,
      checker: options.checker === true,
      frame: frameBitmap,
    })
  } else {
    paintManualBase(ctx, project, assets, artwork, artBitmap, frameBitmap, options.checker === true)
  }
  if (artwork?.assetId && !artBitmap) paintMissing(ctx, width, height)
  if (options.maxEdge != null) previewBase = { key, canvas }
  return canvas
}

function baseSignature(project: ThumbnailProject, assets: ThumbnailRenderAssets): string {
  const artwork = artworkLayer(project)
  const frame = frameLayer(project)
  const background = project.layers.find((item) => item.kind === 'background')
  return JSON.stringify({
    art: artwork?.assetId ?? null,
    hasArt: Boolean(artwork?.assetId && assets.byId[artwork.assetId]),
    composition: artwork?.composition ?? null,
    crop: artwork?.crop,
    fit: artwork?.fit,
    frame: frame?.visible ? frame.assetId : null,
    hasFrame: Boolean(frame?.assetId && assets.byId[frame.assetId]),
    background: background
      ? { box: background.boxStyle, blur: background.blur, opacity: background.opacity, visible: background.visible }
      : null,
  })
}

function paintManualBase(
  ctx: CanvasRenderingContext2D,
  project: ThumbnailProject,
  assets: ThumbnailRenderAssets,
  artwork: ThumbnailLayer | undefined,
  artBitmap: ThumbnailBitmap | undefined,
  frame: CanvasImageSource | null,
  checker: boolean,
): void {
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const background = project.layers.find((item) => item.kind === 'background')
  ctx.clearRect(0, 0, width, height)
  if (background?.visible) {
    if (background.blur > 0 && artBitmap) {
      ctx.save()
      ctx.filter = `blur(${Math.max(1, (background.blur / 100) * 24 * (height / 1080))}px)`
      drawFitted(ctx, artBitmap, { x: 0, y: 0, w: 1, h: 1 }, 'cover', 0, 0, width, height)
      ctx.restore()
    }
    paintBoxFill(ctx, background, 0, 0, width, height, background.blur > 0 ? 0.35 : background.boxStyle.fillOpacity)
  } else if (checker) {
    paintChecker(ctx, width, height)
  }
  if (artwork?.visible && artBitmap) {
    const box = layerBox(artwork)
    drawFitted(
      ctx,
      artBitmap,
      artwork.crop,
      artwork.fit,
      box.x * width,
      box.y * height,
      box.width * width,
      box.height * height,
    )
  }
  if (frame) ctx.drawImage(frame, 0, 0, width, height)
}

function paintOverlays(
  ctx: CanvasRenderingContext2D,
  project: ThumbnailProject,
  assets: ThumbnailRenderAssets,
  options: RenderThumbnailOptions,
): void {
  for (const item of layersInDrawOrder(project.layers)) {
    if (!item.visible || !OVERLAY_KINDS.has(item.kind)) continue
    if (item.kind === 'image') {
      const bitmap = item.assetId ? assets.byId[item.assetId] : undefined
      if (!bitmap) continue
      const box = pixelBox(ctx, item)
      ctx.save()
      transformBox(ctx, box, item)
      ctx.globalAlpha = item.opacity
      drawFitted(ctx, bitmap, item.crop, item.fit, -box.width / 2, -box.height / 2, box.width, box.height)
      ctx.restore()
      continue
    }
    if (item.kind === 'shape') {
      const box = pixelBox(ctx, item)
      ctx.save()
      transformBox(ctx, box, item)
      ctx.globalAlpha = item.opacity
      paintStyledRect(ctx, item, -box.width / 2, -box.height / 2, box.width, box.height)
      ctx.restore()
      continue
    }
    const label = item.kind === 'badge' ? badgeLabel(project, item) : item.text
    if (!label.trim()) continue
    drawTextLayer(ctx, project, item, label)
  }
}

function drawTextLayer(ctx: CanvasRenderingContext2D, project: ThumbnailProject, item: ThumbnailLayer, label: string): void {
  const box = pixelBox(ctx, item)
  let color = item.textStyle.color
  let fill = item.boxStyle.fill === 'none' ? 'rgba(0,0,0,0)' : item.boxStyle.color
  let fillOpacity = item.boxStyle.fillOpacity
  if (project.autoContrast && item.kind === 'badge') {
    const luminance = averageLuminance(ctx, box.x, box.y, box.width, box.height)
    const pair = contrastPair(luminance)
    color = pair.color
    fill = pair.fill
    fillOpacity = 1
  }
  ctx.save()
  transformBox(ctx, box, item)
  ctx.globalAlpha = item.opacity
  applyShadow(ctx, item, ctx.canvas.height)
  paintStyledRect(ctx, item, -box.width / 2, -box.height / 2, box.width, box.height, fill, fillOpacity)
  ctx.shadowColor = 'transparent'
  const padding = item.boxStyle.padding * Math.min(ctx.canvas.width, ctx.canvas.height)
  const maxWidth = Math.max(8, box.width - padding * 2)
  let fontPx = Math.max(8, item.textStyle.fontSize * ctx.canvas.height)
  ctx.textAlign = item.textStyle.align
  ctx.textBaseline = 'middle'
  const letter = item.textStyle.letterSpacing
  ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${letter}em`
  for (let attempt = 0; attempt < 12; attempt += 1) {
    ctx.font = `${item.textStyle.fontWeight} ${fontPx}px ${item.textStyle.fontFamily}`
    if (ctx.measureText(label).width <= maxWidth || fontPx <= 10) break
    fontPx *= 0.9
  }
  const textX = item.textStyle.align === 'left' ? -box.width / 2 + padding : item.textStyle.align === 'right' ? box.width / 2 - padding : 0
  if (item.textStyle.strokeWidth > 0) {
    ctx.lineWidth = Math.max(1, item.textStyle.strokeWidth * ctx.canvas.height)
    ctx.strokeStyle = item.textStyle.strokeColor
    ctx.strokeText(label, textX, 0, maxWidth)
  }
  if (item.textStyle.shadowBlur > 0) {
    ctx.shadowColor = item.textStyle.shadowColor
    ctx.shadowBlur = item.textStyle.shadowBlur * ctx.canvas.height
    ctx.shadowOffsetX = item.textStyle.shadowX * ctx.canvas.width
    ctx.shadowOffsetY = item.textStyle.shadowY * ctx.canvas.height
  }
  ctx.fillStyle = color
  ctx.fillText(label, textX, 0, maxWidth)
  ctx.restore()
}

function paintChrome(ctx: CanvasRenderingContext2D, project: ThumbnailProject, options: RenderThumbnailOptions): void {
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  if (options.safeArea && project.showSafeArea) {
    const mx = project.safeMargin * width
    const my = project.safeMargin * height
    ctx.save()
    ctx.strokeStyle = 'rgba(252, 211, 77, 0.9)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.strokeRect(mx, my, width - mx * 2, height - my * 2)
    ctx.restore()
  }
  if (options.guides?.vertical || options.guides?.horizontal) {
    ctx.save()
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    if (options.guides.vertical) {
      ctx.moveTo(width / 2, 0)
      ctx.lineTo(width / 2, height)
    }
    if (options.guides.horizontal) {
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
    }
    ctx.stroke()
    ctx.restore()
  }
  for (const id of options.selectedIds ?? []) {
    const item = project.layers.find((layer) => layer.id === id)
    if (!item) continue
    const box = pixelBox(ctx, item)
    ctx.save()
    ctx.strokeStyle = '#fcd34d'
    ctx.lineWidth = 2
    ctx.strokeRect(box.x, box.y, box.width, box.height)
    ctx.restore()
  }
}

function pixelBox(ctx: CanvasRenderingContext2D, item: ThumbnailLayer): { x: number; y: number; width: number; height: number } {
  const box = layerBox(item)
  return {
    x: box.x * ctx.canvas.width,
    y: box.y * ctx.canvas.height,
    width: box.width * ctx.canvas.width,
    height: box.height * ctx.canvas.height,
  }
}

function transformBox(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number }, item: ThumbnailLayer): void {
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2)
  ctx.rotate((item.rotation * Math.PI) / 180)
}

function paintBoxFill(ctx: CanvasRenderingContext2D, item: ThumbnailLayer, x: number, y: number, width: number, height: number, opacity: number): void {
  if (item.boxStyle.fill === 'none') return
  ctx.save()
  ctx.globalAlpha = item.opacity * opacity
  ctx.fillStyle = fillStyle(ctx, item, x, y, height)
  ctx.fillRect(x, y, width, height)
  ctx.restore()
}

function paintStyledRect(
  ctx: CanvasRenderingContext2D,
  item: ThumbnailLayer,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = item.boxStyle.color,
  fillOpacity = item.boxStyle.fillOpacity,
): void {
  const radius = item.boxStyle.radius * Math.min(ctx.canvas.width, ctx.canvas.height)
  const alpha = ctx.globalAlpha
  ctx.beginPath()
  roundRect(ctx, x, y, width, height, radius)
  if (item.boxStyle.fill !== 'none' || fill.startsWith('rgba')) {
    ctx.globalAlpha = Math.min(1, alpha * (fill.startsWith('rgba') ? 1 : fillOpacity))
    ctx.fillStyle = fill.startsWith('rgba') ? fill : fillStyle(ctx, item, x, y, height)
    ctx.fill()
    ctx.globalAlpha = alpha
  }
  if (item.boxStyle.borderWidth > 0) {
    ctx.strokeStyle = item.boxStyle.borderColor
    ctx.lineWidth = Math.max(1, item.boxStyle.borderWidth * Math.min(ctx.canvas.width, ctx.canvas.height))
    ctx.stroke()
  }
}

function fillStyle(ctx: CanvasRenderingContext2D, item: ThumbnailLayer, x: number, y: number, height: number): string | CanvasGradient {
  if (item.boxStyle.fill !== 'gradient') return item.boxStyle.color
  const gradient = ctx.createLinearGradient(x, y, x, y + height)
  gradient.addColorStop(0, item.boxStyle.color)
  gradient.addColorStop(1, item.boxStyle.color2)
  return gradient
}

function applyShadow(ctx: CanvasRenderingContext2D, item: ThumbnailLayer, canvasHeight: number): void {
  if (item.boxStyle.glowBlur > 0) {
    ctx.shadowColor = item.boxStyle.glowColor
    ctx.shadowBlur = item.boxStyle.glowBlur * canvasHeight
    return
  }
  if (item.boxStyle.shadowBlur > 0) {
    ctx.shadowColor = item.boxStyle.shadowColor
    ctx.shadowBlur = item.boxStyle.shadowBlur * canvasHeight
    ctx.shadowOffsetX = item.boxStyle.shadowX * ctx.canvas.width
    ctx.shadowOffsetY = item.boxStyle.shadowY * canvasHeight
  }
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

function averageLuminance(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): number {
  const sx = Math.max(0, Math.floor(x))
  const sy = Math.max(0, Math.floor(y))
  const sw = Math.max(1, Math.min(ctx.canvas.width - sx, Math.floor(width)))
  const sh = Math.max(1, Math.min(ctx.canvas.height - sy, Math.floor(height)))
  if (sw < 1 || sh < 1) return 0
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(sx, sy, sw, sh).data
  } catch {
    return 0
  }
  const stepX = Math.max(1, Math.floor(sw / 8))
  const stepY = Math.max(1, Math.floor(sh / 8))
  let total = 0
  let count = 0
  for (let py = 0; py < sh; py += stepY) {
    for (let px = 0; px < sw; px += stepX) {
      const index = (py * sw + px) * 4
      total += 0.2126 * (data[index] / 255) + 0.7152 * (data[index + 1] / 255) + 0.0722 * (data[index + 2] / 255)
      count += 1
    }
  }
  return count ? total / count : 0
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

function jpegFill(project: ThumbnailProject): string {
  const background = project.layers.find((item) => item.kind === 'background')
  if (background && background.boxStyle.fill !== 'none' && /^#[0-9a-fA-F]{6}$/.test(background.boxStyle.color)) return background.boxStyle.color
  return '#000000'
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

function paintChecker(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const size = Math.max(8, Math.round(width / 40))
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = (x / size + y / size) % 2 === 0 ? '#2a2d34' : '#1a1c22'
      ctx.fillRect(x, y, size, size)
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}
