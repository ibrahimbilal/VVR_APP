import { bakePlacement, paintComposition, type RasterSurface } from '../composeCanvas'
import type { ScreensaverImageRenderer, ScreensaverRenderInput } from './types'

export class Canvas2DScreensaverRenderer implements ScreensaverImageRenderer {
  readonly backend = 'canvas2d' as const
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private bakeKey = ''
  private baked: RasterSurface | null = null

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('Could not create 2D context.')
    this.ctx = ctx
  }

  resize(_cssWidth: number, _cssHeight: number, _pixelWidth: number, _pixelHeight: number): void {
    this.baked = null
    this.bakeKey = ''
  }

  render(input: ScreensaverRenderInput): { bakeMs: number | null; compositeMs: number | null } {
    const element = this.canvas
    const ctx = this.ctx
    if (!element || !ctx) return { bakeMs: null, compositeMs: null }

    let bakeMs: number | null = null
    let compositeMs: number | null = null

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, element.width, element.height)

    const bakeStart = performance.now()
    const baked = this.currentBake(input, element)
    bakeMs = performance.now() - bakeStart

    const compStart = performance.now()
    const { view } = input
    ctx.translate(element.width / 2 + view.panX * element.width, element.height / 2 + view.panY * element.height)
    ctx.scale(view.zoom, view.zoom)
    ctx.translate(-element.width / 2, -element.height / 2)
    paintComposition(ctx, baked, input.source, input.sourceWidth, input.sourceHeight, input.composition, {
      flatten: false,
      checker: true,
      frame: input.frame,
    })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    compositeMs = performance.now() - compStart

    return { bakeMs, compositeMs }
  }

  dispose(): void {
    this.canvas = null
    this.ctx = null
    this.baked = null
    this.bakeKey = ''
  }

  private currentBake(input: ScreensaverRenderInput, element: HTMLCanvasElement): RasterSurface | null {
    const source = input.source
    if (!source || input.sourceWidth < 1) return null
    const key = `${element.width}x${element.height}:${input.compareAdjustments}:${JSON.stringify(input.composition.adjustments)}:${JSON.stringify(input.composition.crop)}:${input.composition.width}:${input.composition.height}:${input.previewReducedQuality}`
    if (!this.baked || this.bakeKey !== key) {
      const composition = input.previewReducedQuality
        ? { ...input.composition, adjustments: { ...input.composition.adjustments, sharpness: 0, blur: Math.min(input.composition.adjustments.blur, 40) } }
        : input.composition
      this.baked = bakePlacement(source, input.sourceWidth, input.sourceHeight, composition, element.width, element.height, input.compareAdjustments)
      this.bakeKey = key
    }
    return this.baked
  }
}
