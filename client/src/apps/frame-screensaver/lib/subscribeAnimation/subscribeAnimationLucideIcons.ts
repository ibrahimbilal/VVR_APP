/** Lucide icon geometry (24×24 viewBox) for canvas export — matches @lucide/vue Bell & ThumbsUp. */

export const LUCIDE_ICON_VIEWBOX = 24

/** lucide: bell */
export const LUCIDE_BELL_PATHS = [
  'M10.268 21a2 2 0 0 0 3.464 0',
  'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
] as const

/** lucide: bell-ring */
export const LUCIDE_BELL_RING_PATHS = [
  'M10.268 21a2 2 0 0 0 3.464 0',
  'M22 8c0-2.3-.8-4.3-2-6',
  'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
  'M4 2C2.8 3.7 2 5.7 2 8',
] as const

/** lucide: thumbs-up */
export const LUCIDE_THUMBS_UP_PATHS = [
  'M7 10v12',
  'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
] as const

/** lucide: mouse-pointer (tip near top-left of viewBox) */
export const LUCIDE_MOUSE_POINTER_PATHS = [
  'M12.586 12.586 19 19',
  'M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z',
] as const

export const LUCIDE_MOUSE_POINTER_HOTSPOT = { x: 3.7, y: 3.05 }

export function strokeLucidePaths(
  ctx: CanvasRenderingContext2D,
  paths: readonly string[],
  centerX: number,
  centerY: number,
  pixelSize: number,
  color: string,
  options?: { strokeWidth?: number; fill?: boolean; rotationDeg?: number; scale?: number },
): void {
  const strokeWidth = options?.strokeWidth ?? 2
  const fill = options?.fill ?? false
  const rotationDeg = options?.rotationDeg ?? 0
  const extraScale = options?.scale ?? 1
  const scale = (pixelSize / LUCIDE_ICON_VIEWBOX) * extraScale
  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate((rotationDeg * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.translate(-LUCIDE_ICON_VIEWBOX / 2, -LUCIDE_ICON_VIEWBOX / 2)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = strokeWidth / scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of paths) {
    const path = new Path2D(d)
    if (fill) ctx.fill(path, 'evenodd')
    ctx.stroke(path)
  }
  ctx.restore()
}
