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

export const ANCHORS: { id: FixedAnchor; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'middle-left', label: 'Middle Left' },
  { id: 'center', label: 'Center' },
  { id: 'middle-right', label: 'Middle Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
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

export const BADGE_MARGIN_MAX_RATIO = 0.2

export function maxBadgeMarginPx(frameWidth: number, frameHeight: number): number {
  const short = Math.min(Math.max(1, frameWidth), Math.max(1, frameHeight))
  return Math.round(BADGE_MARGIN_MAX_RATIO * short)
}

export function clampBadgeMarginPx(marginPx: number, frameWidth: number, frameHeight: number): number {
  return clampUnit(marginPx, 0, maxBadgeMarginPx(frameWidth, frameHeight))
}

/** Saved projects before 2026-10-28 stored margin as a normalized fraction of the frame. */
export function migrateLegacyBadgeMargin(value: number, frameWidth: number, frameHeight: number): number {
  if (value > 0 && value <= 0.45) {
    return Math.round(value * Math.min(Math.max(1, frameWidth), Math.max(1, frameHeight)))
  }
  return clampBadgeMarginPx(value, frameWidth, frameHeight)
}

export function anchorPoint(anchor: FixedAnchor, marginPx: number, frameWidth: number, frameHeight: number): AnchorPoint {
  const px = clampBadgeMarginPx(marginPx, frameWidth, frameHeight)
  const mx = px / Math.max(1, frameWidth)
  const my = px / Math.max(1, frameHeight)
  const { ax, ay } = anchorFactors(anchor)
  return {
    x: ax === 0 ? mx : ax === 1 ? 1 - mx : 0.5,
    y: ay === 0 ? my : ay === 1 ? 1 - my : 0.5,
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

export function presetAnchorPoint(
  anchor: FixedAnchor,
  marginPx: number,
  offsetX: number,
  offsetY: number,
  frameWidth: number,
  frameHeight: number,
): AnchorPoint {
  const point = anchorPoint(anchor, marginPx, frameWidth, frameHeight)
  return {
    x: clampUnit(point.x + offsetX, -0.25, 1.25),
    y: clampUnit(point.y + offsetY, -0.25, 1.25),
  }
}

/** Move a second badge off a shared preset corner without touching a dragged badge. */
export function nudgeForSharedAnchor(anchor: FixedAnchor, step = 0.16): { x: number; y: number } {
  if (anchor.startsWith('top')) return { x: 0, y: step }
  if (anchor.startsWith('bottom')) return { x: 0, y: -step }
  if (anchor.endsWith('left')) return { x: step, y: 0 }
  if (anchor.endsWith('right')) return { x: -step, y: 0 }
  return { x: 0, y: step }
}
