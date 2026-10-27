export const ANCHOR_IDS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export type FixedAnchor = (typeof ANCHOR_IDS)[number]
export type AnchorId = FixedAnchor | 'free'

export const ANCHORS: { id: AnchorId; label: string }[] = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-center', label: 'Top center' },
  { id: 'top-right', label: 'Top right' },
  { id: 'middle-left', label: 'Middle left' },
  { id: 'center', label: 'Center' },
  { id: 'middle-right', label: 'Middle right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-center', label: 'Bottom center' },
  { id: 'bottom-right', label: 'Bottom right' },
]

export interface NormBox {
  x: number
  y: number
  width: number
  height: number
}

export interface NormCrop {
  x: number
  y: number
  w: number
  h: number
}

export interface AnchorPoint {
  x: number
  y: number
}

export function clampUnit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function anchorFactors(anchor: AnchorId): { ax: number; ay: number } {
  if (anchor === 'free' || anchor === 'center') return { ax: 0.5, ay: 0.5 }
  const ax = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 1 : 0.5
  const ay = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : 0.5
  return { ax, ay }
}

export function anchorPoint(anchor: FixedAnchor, margin: number): AnchorPoint {
  const m = clampUnit(margin, 0, 0.45)
  const { ax, ay } = anchorFactors(anchor)
  return {
    x: ax === 0 ? m : ax === 1 ? 1 - m : 0.5,
    y: ay === 0 ? m : ay === 1 ? 1 - m : 0.5,
  }
}

export function topLeftFromAnchor(anchor: AnchorId, x: number, y: number, width: number, height: number): NormBox {
  const { ax, ay } = anchorFactors(anchor)
  return {
    x: x - width * ax,
    y: y - height * ay,
    width,
    height,
  }
}

export function rectsOverlap(a: NormBox, b: NormBox, gap = 0.005): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}

export function normToPx(value: number, size: number): number {
  return Math.round(value * Math.max(0, size))
}

export function pxToNorm(value: number, size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0
  return value / size
}

export function snapNorm(value: number, grid: number, snapCenter: boolean): number {
  let next = value
  if (grid > 0) next = Math.round(value / grid) * grid
  const threshold = Math.max(grid || 0, 0.015)
  if (snapCenter && Math.abs(next - 0.5) <= threshold) next = 0.5
  return clampUnit(next, -0.25, 1.25)
}

export function clampNormCrop(crop: NormCrop): NormCrop {
  const w = clampUnit(crop.w, 0.05, 1)
  const h = clampUnit(crop.h, 0.05, 1)
  return {
    w,
    h,
    x: clampUnit(crop.x, 0, 1 - w),
    y: clampUnit(crop.y, 0, 1 - h),
  }
}

export function fullNormCrop(): NormCrop {
  return { x: 0, y: 0, w: 1, h: 1 }
}

/** Factor above 1 zooms in by shrinking the crop around its center. */
export function zoomNormCrop(crop: NormCrop, factor: number): NormCrop {
  const scale = Number.isFinite(factor) && factor > 0 ? factor : 1
  const w = clampUnit(crop.w / scale, 0.05, 1)
  const h = clampUnit(crop.h / scale, 0.05, 1)
  const cx = crop.x + crop.w / 2
  const cy = crop.y + crop.h / 2
  return clampNormCrop({ x: cx - w / 2, y: cy - h / 2, w, h })
}

export function panNormCrop(crop: NormCrop, dx: number, dy: number): NormCrop {
  return clampNormCrop({ ...crop, x: crop.x + dx, y: crop.y + dy })
}

export interface BadgePlaceItem {
  id: string
  width: number
  height: number
  prefer: AnchorId
}

export interface PlacedAnchor {
  anchor: FixedAnchor
  x: number
  y: number
}

function candidateAnchors(prefer: AnchorId): FixedAnchor[] {
  if (prefer === 'free' || !ANCHOR_IDS.includes(prefer as FixedAnchor)) return [...ANCHOR_IDS]
  return [prefer as FixedAnchor, ...ANCHOR_IDS.filter((id) => id !== prefer)]
}

/**
 * Deterministic badge placement. Non-overlapping spots win. When luminance
 * samples exist, higher contrast beats the preferred corner.
 */
export function autoPlaceBadges(
  items: BadgePlaceItem[],
  options: {
    margin: number
    frameInset?: number
    luminance?: Partial<Record<FixedAnchor, number>>
    textIsLight?: boolean
  },
): Record<string, PlacedAnchor> {
  const margin = clampUnit(options.margin + (options.frameInset ?? 0), 0, 0.45)
  const textIsLight = options.textIsLight !== false
  const occupied: NormBox[] = []
  const result: Record<string, PlacedAnchor> = {}
  for (const item of items) {
    const width = clampUnit(item.width, 0.02, 1)
    const height = clampUnit(item.height, 0.02, 1)
    let best: { anchor: FixedAnchor; x: number; y: number; box: NormBox } | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const [index, anchor] of candidateAnchors(item.prefer).entries()) {
      const point = anchorPoint(anchor, margin)
      const box = topLeftFromAnchor(anchor, point.x, point.y, width, height)
      const overlaps = occupied.some((placed) => rectsOverlap(placed, box))
      const sample = options.luminance?.[anchor]
      const contrast = sample == null ? 0.5 : textIsLight ? 1 - clampUnit(sample, 0, 1) : clampUnit(sample, 0, 1)
      const score = contrast * 10 - index * 0.01 - (overlaps ? 100 : 0)
      if (score > bestScore) {
        bestScore = score
        best = { anchor, x: point.x, y: point.y, box }
      }
    }
    if (!best) continue
    occupied.push(best.box)
    result[item.id] = { anchor: best.anchor, x: best.x, y: best.y }
  }
  return result
}

export function contrastPair(luminance: number): { color: string; fill: string } {
  if (clampUnit(luminance, 0, 1) >= 0.55) return { color: '#161616', fill: 'rgba(255,255,255,0.82)' }
  return { color: '#f7f7f7', fill: 'rgba(0,0,0,0.72)' }
}
