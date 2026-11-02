import type { SubscribeAnimationSettings } from '@shared/screensaverSubscribeAnimation'
import { renderSubscribeAnimationAt } from './renderSubscribeAnimation'
import { subscribeAnimationLayout, subscribeAnimationOverlayOnOutput } from './subscribeAnimationLayout'

let scratchCanvas: HTMLCanvasElement | null = null

function scratchContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (!scratchCanvas) scratchCanvas = document.createElement('canvas')
  if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    scratchCanvas.width = width
    scratchCanvas.height = height
  }
  return scratchCanvas.getContext('2d')
}

export function drawSubscribeAnimationOnPreviewOverlay(input: {
  ctx: CanvasRenderingContext2D
  overlay: HTMLCanvasElement
  outputWidth: number
  outputHeight: number
  settings: SubscribeAnimationSettings
  timeSec: number
  mapPoint: (nx: number, ny: number) => { x: number; y: number }
}): void {
  if (!input.settings.enabled) return
  const { x, y, layout } = subscribeAnimationOverlayOnOutput(input.outputWidth, input.outputHeight, input.settings)
  const nx = x / input.outputWidth
  const ny = y / input.outputHeight
  const nw = layout.width / input.outputWidth
  const nh = layout.height / input.outputHeight
  const tl = input.mapPoint(nx, ny)
  const br = input.mapPoint(nx + nw, ny + nh)
  const dw = br.x - tl.x
  const dh = br.y - tl.y
  if (Math.abs(dw) < 2 || Math.abs(dh) < 2) return

  const sctx = scratchContext(layout.width, layout.height)
  if (!sctx) return
  renderSubscribeAnimationAt(sctx, input.timeSec, input.settings, layout)
  input.ctx.save()
  input.ctx.drawImage(scratchCanvas!, 0, 0, layout.width, layout.height, tl.x, tl.y, dw, dh)
  input.ctx.restore()
}
