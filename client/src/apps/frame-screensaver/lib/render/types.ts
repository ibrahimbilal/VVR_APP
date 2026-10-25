import type { ScreensaverComposition } from '@shared/screensaverComposition'

export type ScreensaverRendererBackend = 'webgl2' | 'canvas2d'

export interface ScreensaverRenderView {
  panX: number
  panY: number
  zoom: number
}

export interface ScreensaverRenderInput {
  composition: ScreensaverComposition
  compareAdjustments: boolean
  frame: CanvasImageSource | null
  source: CanvasImageSource | null
  sourceWidth: number
  sourceHeight: number
  view: ScreensaverRenderView
  previewReducedQuality: boolean
}

export interface ScreensaverImageRenderer {
  readonly backend: ScreensaverRendererBackend
  init(canvas: HTMLCanvasElement): Promise<void>
  resize(cssWidth: number, cssHeight: number, pixelWidth: number, pixelHeight: number): void
  render(input: ScreensaverRenderInput): { bakeMs: number | null; compositeMs: number | null }
  dispose(): void
}
