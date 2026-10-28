import { badgeLines, chipLabel, type BadgeStyleId } from '@shared/thumbnailProject'
import { isChipStyle } from './badgeHtml'

export interface RasterBadge {
  canvas: HTMLCanvasElement
  pad: number
  contentWidth: number
  contentHeight: number
}

export async function rasterizeBadge(styleId: BadgeStyleId, text: string, referenceWidth: number): Promise<RasterBadge | null> {
  const trimmed = text.trim()
  if (!trimmed || typeof document === 'undefined') return null
  const width = Math.max(48, Math.round(referenceWidth))
  const pad = Math.max(8, Math.round(width * 0.14))
  const measure = measureWith(width)
  const box = isChipStyle(styleId) ? chipBox(styleId, trimmed, width, measure) : plateBox(styleId, width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(box.width + pad * 2)
  canvas.height = Math.ceil(box.height + pad * 2)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.translate(pad, pad)
  if (isChipStyle(styleId)) drawChip(ctx, styleId, trimmed, box.width, box.height, width)
  else drawPlate(ctx, styleId, trimmed, box.width, box.height, width)
  return { canvas, pad, contentWidth: box.width, contentHeight: box.height }
}

function measureWith(width: number): (font: string, text: string) => number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  return (font, text) => {
    if (!ctx) return width
    ctx.font = font
    return ctx.measureText(text).width
  }
}

function plateBox(styleId: BadgeStyleId, width: number): { width: number; height: number } {
  const aspect = styleId === 'silver-plate' ? 1 : styleId === 'gold-stack' ? 1.3 : styleId === 'silver-stack' ? 1.3 : 1
  return { width, height: width / aspect }
}

function chipBox(styleId: BadgeStyleId, text: string, width: number, measure: (font: string, text: string) => number): { width: number; height: number } {
  const label = chipLabel(text)
  const fontPx = chipFont(label, width)
  const pad = width * 0.14
  const border = styleId === 'gold' || styleId === 'silver' ? 0 : Math.max(3, width * 0.045)
  const textWidth = measure(`700 ${fontPx}px Montserrat`, label)
  return {
    width: Math.max(width, Math.ceil(textWidth + pad * 2 + border * 2)),
    height: Math.round(width * 0.72),
  }
}

function chipFont(label: string, width: number): number {
  const len = Math.max(1, label.length)
  return Math.round(Math.max(width * 0.28, Math.min(width * 0.46, (width * 1.15) / len)))
}

function drawPlate(ctx: CanvasRenderingContext2D, styleId: BadgeStyleId, text: string, width: number, height: number, reference: number): void {
  const lines = badgeLines(text)
  if (styleId === 'silver-plate') drawSilver(ctx, lines.hero, lines.foot, width, height, reference)
  else if (styleId === 'gold-stack') drawStack(ctx, lines.hero, lines.foot, width, height, reference)
  else drawGoldPlate(ctx, lines.hero, lines.foot, width, height, reference)
}

function drawGoldPlate(ctx: CanvasRenderingContext2D, hero: string, foot: string | null, width: number, height: number, reference: number): void {
  shadow(ctx, reference)
  fillRound(ctx, 0, 0, width, height, width * 0.14, vertical(ctx, 0, height, [[0, '#fff6cc'], [0.18, '#f8d56a'], [0.46, '#e2ae34'], [0.74, '#a97812'], [1, '#f0d078']]))
  clearShadow(ctx)
  const inset = width * 0.08
  const innerW = width - inset * 2
  const innerH = height - inset * 2
  fillRound(ctx, inset, inset, innerW, innerH, innerW * 0.12, '#070707')
  const footH = foot ? innerH * 0.23 : 0
  const heroBox = innerH - footH
  fillHero(ctx, hero, inset, inset, innerW, heroBox, reference, true)
  if (foot) {
    const y = inset + heroBox
    ctx.fillStyle = vertical(ctx, y, footH, [[0, '#ffe7a3'], [0.58, '#e2b03a'], [1, '#c4922a']])
    ctx.fillRect(inset, y, innerW, footH)
    fillFoot(ctx, foot, inset, y, innerW, footH, reference, '#141414')
  }
}

function drawSilver(ctx: CanvasRenderingContext2D, hero: string, foot: string | null, width: number, height: number, reference: number): void {
  shadow(ctx, reference)
  fillRound(ctx, 0, 0, width, height, width * 0.05, vertical(ctx, 0, height, [[0, '#ffffff'], [0.28, '#d5d8de'], [0.62, '#8e949c'], [1, '#f2f3f5']]))
  clearShadow(ctx)
  const inset = width * 0.05
  const innerW = width - inset * 2
  const innerH = height - inset * 2
  ctx.fillStyle = vertical(ctx, inset, innerH, [[0, '#2c2c30'], [1, '#121214']])
  ctx.fillRect(inset, inset, innerW, innerH)
  const footH = foot ? innerH * 0.26 : 0
  fillHero(ctx, hero, inset, inset, innerW, innerH - footH, reference, false)
  if (foot) {
    const y = inset + innerH - footH
    ctx.fillStyle = vertical(ctx, y, footH, [[0, '#f7f7f8'], [1, '#b7bcc4']])
    ctx.fillRect(inset, y, innerW, footH)
    fillFoot(ctx, foot, inset, y, innerW, footH, reference, '#1a1a1a')
  }
}

function drawStack(ctx: CanvasRenderingContext2D, hero: string, foot: string | null, width: number, height: number, reference: number): void {
  shadow(ctx, reference)
  fillRound(ctx, 0, 0, width, height, width * 0.1, vertical(ctx, 0, height, [[0, '#fff6d0'], [0.42, '#e6b325'], [1, '#8a6812']]))
  clearShadow(ctx)
  const inset = width * 0.034
  const innerW = width - inset * 2
  const innerH = height - inset * 2
  fillRound(ctx, inset, inset, innerW, innerH, innerW * 0.08, '#050505')
  const footH = foot ? innerH * 0.28 : 0
  fillHero(ctx, hero, inset, inset, innerW, innerH - footH, reference, true)
  if (foot) fillFoot(ctx, foot, inset, inset + innerH - footH, innerW, footH, reference, null)
}

function drawChip(ctx: CanvasRenderingContext2D, styleId: BadgeStyleId, text: string, width: number, height: number, reference: number): void {
  const label = chipLabel(text)
  const radius = reference * 0.16
  const border = styleId === 'gold' || styleId === 'silver' ? 0 : Math.max(3, reference * 0.045)
  shadow(ctx, reference)
  if (styleId === 'outline') fillRound(ctx, 0, 0, width, height, radius, '#ffffff')
  else if (styleId === 'invert') fillRound(ctx, 0, 0, width, height, radius, '#111111')
  else if (styleId === 'silver') fillRound(ctx, 0, 0, width, height, radius, vertical(ctx, 0, height, [[0, '#ffffff'], [0.28, '#e4e7ec'], [0.62, '#a8aeb6'], [1, '#d5d8de']]))
  else fillRound(ctx, 0, 0, width, height, radius, vertical(ctx, 0, height, [[0, '#fff1b8'], [0.3, '#f6d15a'], [0.68, '#e6b325'], [1, '#c8962e']]))
  clearShadow(ctx)
  if (border > 0) {
    ctx.strokeStyle = styleId === 'invert' ? '#ffffff' : '#111111'
    ctx.lineWidth = border
    strokeRound(ctx, border / 2, border / 2, width - border, height - border, radius)
  }
  ctx.fillStyle = styleId === 'invert' ? '#ffffff' : '#141414'
  ctx.font = `700 ${chipFont(label, reference)}px Montserrat`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, width / 2, height / 2)
}

function fillHero(ctx: CanvasRenderingContext2D, hero: string, x: number, y: number, width: number, height: number, reference: number, gold: boolean): void {
  const size = heroPx(hero, reference)
  ctx.font = `${size}px Anton`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (gold) ctx.fillStyle = vertical(ctx, y + height * 0.2, height * 0.7, [[0, '#fff6cc'], [0.4, '#f8d56a'], [0.78, '#e0a82a'], [1, '#a97812']])
  else ctx.fillStyle = vertical(ctx, y + height * 0.2, height * 0.7, [[0, '#ffffff'], [0.42, '#dfe2e6'], [1, '#9aa0a8']])
  ctx.fillText(hero, x + width / 2, y + height / 2)
}

function fillFoot(ctx: CanvasRenderingContext2D, foot: string, x: number, y: number, width: number, height: number, reference: number, color: string | null): void {
  const size = Math.round(reference * (foot.length > 10 ? 0.052 : 0.068))
  ctx.font = `800 ${size}px Montserrat`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color ?? vertical(ctx, y, height, [[0, '#fff6cc'], [0.4, '#f8d56a'], [0.78, '#e0a82a'], [1, '#a97812']])
  ctx.fillText(foot, x + width / 2, y + height / 2)
}

function heroPx(hero: string, reference: number): number {
  const fs = reference * 0.24
  const em = hero.length <= 2 ? 1.9 : hero.length <= 3 ? 1.55 : hero.length <= 5 ? 1.15 : 0.88
  return Math.round(fs * em)
}

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string | CanvasGradient): void {
  traceRound(ctx, x, y, width, height, radius)
  ctx.fillStyle = fill
  ctx.fill()
}

function strokeRound(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  traceRound(ctx, x, y, width, height, radius)
  ctx.stroke()
}

function traceRound(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function vertical(ctx: CanvasRenderingContext2D, y: number, height: number, stops: [number, string][]): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, y, 0, y + height)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  return gradient
}

function shadow(ctx: CanvasRenderingContext2D, reference: number): void {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)'
  ctx.shadowBlur = reference * 0.08
  ctx.shadowOffsetY = reference * 0.04
}

function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}
