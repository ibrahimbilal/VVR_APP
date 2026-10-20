import type { OverlayRank } from './format'
import type { BannerStyle, CaptionStyle, RankingStyle, TitleSpan } from '../types'

export interface DrawInput {
  width: number
  height: number
  bannerHeight: number
  banner: BannerStyle
  spans: TitleSpan[]
  ranking: RankingStyle
  caption: CaptionStyle
  ranks: OverlayRank[]
}

interface Glyph {
  text: string
  color: string
  width: number
}

interface Placed extends Glyph {
  x: number
  y: number
}

export async function ensureFonts(): Promise<void> {
  const faces = [
    '400 160px Anton',
    '500 80px Oswald',
    '700 80px Oswald',
    '400 180px "Bebas Neue"',
    '700 64px Montserrat',
    '800 64px Montserrat',
    '400 16px Inter',
    '600 16px Inter',
    '700 64px Inter',
    '800 64px Inter',
  ]
  await Promise.all(faces.map((face) => document.fonts.load(face).catch(() => [])))
  await document.fonts.ready
}

export function drawOverlay(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  ctx.clearRect(0, 0, input.width, input.height)
  ctx.fillStyle = input.banner.background
  ctx.fillRect(0, 0, input.width, input.bannerHeight)
  drawTitle(ctx, input)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, input.bannerHeight, input.width, input.height - input.bannerHeight)
  ctx.clip()
  drawRanks(ctx, input)
  ctx.restore()
}

function drawTitle(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const padX = Math.round(48 * (input.width / 1080))
  const padY = Math.round(16 * (input.width / 1080))
  const maxWidth = Math.max(40, input.width - padX * 2)
  let size = Math.max(28, Math.round(input.banner.fontSize))
  let placed: Placed[] = []
  for (let attempt = 0; attempt < 12; attempt += 1) {
    ctx.font = font(input.banner.fontWeight, size, input.banner.fontFamily)
    const space = Math.max(1, ctx.measureText(' ').width)
    const lines = wrapSpans(ctx, input.spans, maxWidth)
    const lineGap = size * input.banner.lineHeight
    const block = lines.length === 0 ? 0 : (lines.length - 1) * lineGap + size
    const widest = lines.reduce((max, line) => Math.max(max, lineWidth(line, space)), 0)
    if ((block <= input.bannerHeight - padY * 2 && widest <= maxWidth + 2) || size <= 28) {
      const top = Math.max(padY / 2, (input.bannerHeight - block) / 2)
      placed = placeLines(lines, top, lineGap, input.banner.align, input.width, padX, space)
      break
    }
    size = Math.max(28, Math.round(size * 0.9))
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, input.width, input.bannerHeight)
  ctx.clip()
  ctx.font = font(input.banner.fontWeight, size, input.banner.fontFamily)
  for (const glyph of placed) {
    paintText(ctx, glyph.text, glyph.x, glyph.y, glyph.color, input.banner.outlineWidth, input.banner.outlineColor, input.banner.shadow)
  }
  ctx.restore()
}

function drawRanks(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const rows = input.ranks
  if (rows.length === 0) return
  const ranking = input.ranking
  const pad = Math.round(28 * (input.width / 1080))
  const top = input.bannerHeight + Math.max(0, ranking.positionY)
  const available = Math.max(36, input.height - pad - top)
  const fitted = fitRankSize(ranking.fontSize, ranking.outlineWidth, rows.length, available, ranking.itemSpacing)
  const x = Math.max(0, ranking.positionX)
  const opacity = Math.max(0.15, Math.min(1, ranking.opacity))

  ctx.save()
  ctx.globalAlpha = opacity
  rows.forEach((row, index) => {
    const y = top + index * fitted.lineGap
    ctx.font = font(ranking.fontWeight, fitted.size, ranking.fontFamily)
    paintText(ctx, row.label, x, y, row.color, fitted.outline, ranking.outlineColor, ranking.shadow)
    if (!row.title) return
    const gap = Math.max(12, Math.round(fitted.size * 0.22))
    const titleX = x + ctx.measureText(row.label).width + gap
    const titleMax = input.width - pad - titleX
    if (titleMax < 24) return
    const titleSize = Math.max(16, Math.min(input.caption.fontSize, Math.round(fitted.size * 0.72)))
    const titleOutline = input.caption.outlineWidth * (titleSize / Math.max(1, input.caption.fontSize))
    ctx.font = font(input.caption.fontWeight, titleSize, input.caption.fontFamily)
    const title = ellipsis(ctx, row.title, titleMax)
    const titleY = y + Math.max(0, (fitted.size - titleSize) / 2)
    paintText(ctx, title, titleX, titleY, row.titleColor || input.caption.color, titleOutline, input.caption.outlineColor, input.caption.shadow)
  })
  ctx.restore()
}

function fitRankSize(
  maxSize: number,
  maxOutline: number,
  count: number,
  available: number,
  itemSpacing: number,
): { size: number; outline: number; lineGap: number } {
  const extra = (Number.isFinite(itemSpacing) ? Math.max(0, itemSpacing) : 8) / 100
  let size = Math.max(28, Math.round(maxSize))
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const outline = maxSize > 0 ? (maxOutline * size) / maxSize : 0
    const lineGap = size + outline * 2 + size * extra
    if (count * lineGap <= available || size <= 28) return { size, outline, lineGap }
    size = Math.max(28, Math.round(size * 0.88))
  }
  const outline = maxSize > 0 ? (maxOutline * size) / maxSize : 0
  return { size, outline, lineGap: size + outline * 2 + size * extra }
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let value = text.trim()
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1)
  return `${value.trimEnd()}…`
}

function wrapSpans(ctx: CanvasRenderingContext2D, spans: TitleSpan[], maxWidth: number): Glyph[][] {
  const lines: Glyph[][] = []
  let current: Glyph[] = []
  let used = 0
  const space = Math.max(1, ctx.measureText(' ').width)
  const commit = () => {
    if (current.length > 0) lines.push(current)
    current = []
    used = 0
  }
  for (const span of spans) {
    if (!span.text) continue
    if (span.breakBefore) commit()
    const width = ctx.measureText(span.text).width
    const needed = current.length === 0 ? width : used + space + width
    if (current.length > 0 && needed > maxWidth) commit()
    current.push({ text: span.text, color: span.color, width })
    used = current.length === 1 ? width : used + space + width
  }
  commit()
  return lines
}

function placeLines(
  lines: Glyph[][],
  top: number,
  lineGap: number,
  align: BannerStyle['align'],
  width: number,
  padX: number,
  space: number,
): Placed[] {
  const placed: Placed[] = []
  lines.forEach((line, index) => {
    const full = lineWidth(line, space)
    let x = padX
    if (align === 'center') x = (width - full) / 2
    if (align === 'right') x = width - padX - full
    const y = top + index * lineGap
    for (const glyph of line) {
      placed.push({ ...glyph, x, y })
      x += glyph.width + space
    }
  })
  return placed
}

function lineWidth(line: Glyph[], space: number): number {
  if (line.length === 0) return 0
  return line.reduce((sum, glyph) => sum + glyph.width, 0) + space * (line.length - 1)
}

function paintText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  outlineWidth: number,
  outlineColor: string,
  shadow: boolean,
): void {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  if (shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = Math.max(2, outlineWidth * 0.25)
    ctx.shadowOffsetY = Math.max(3, outlineWidth * 0.35)
  }
  if (outlineWidth > 0) {
    ctx.lineWidth = outlineWidth * 2
    ctx.strokeStyle = outlineColor
    ctx.strokeText(text, x, y)
  }
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  ctx.restore()
}

function font(weight: number, size: number, family: string): string {
  return `${Math.round(weight)} ${Math.max(1, Math.round(size))}px "${family}", "Arial Black", sans-serif`
}
