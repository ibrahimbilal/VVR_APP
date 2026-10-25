import { readPreviewRendererMode } from '../previewRendererPreference'
import { Canvas2DScreensaverRenderer } from './Canvas2DScreensaverRenderer'
import type { ScreensaverRendererOptions } from './rendererOptions'
import { WebGL2ScreensaverRenderer } from './WebGL2ScreensaverRenderer'
import type { ScreensaverImageRenderer } from './types'

export type { ScreensaverRendererOptions } from './rendererOptions'

function forcedBackend(): 'webgl2' | 'canvas2d' | null {
  const mode = readPreviewRendererMode()
  if (mode === 'auto') return null
  return mode
}

export function webGl2Available(): boolean {
  const canvas = document.createElement('canvas')
  return Boolean(canvas.getContext('webgl2'))
}

export async function createScreensaverRenderer(
  canvas: HTMLCanvasElement,
  options?: ScreensaverRendererOptions,
): Promise<ScreensaverImageRenderer> {
  const force = forcedBackend()
  if (force === 'canvas2d') {
    const renderer = new Canvas2DScreensaverRenderer()
    await renderer.init(canvas)
    return renderer
  }
  if (force === 'webgl2' || force === null) {
    try {
      const renderer = new WebGL2ScreensaverRenderer(options)
      await renderer.init(canvas)
      return renderer
    } catch {
      // fall through
    }
  }
  const fallback = new Canvas2DScreensaverRenderer()
  await fallback.init(canvas)
  return fallback
}

export async function createCanvas2DScreensaverRenderer(canvas: HTMLCanvasElement): Promise<ScreensaverImageRenderer> {
  const renderer = new Canvas2DScreensaverRenderer()
  await renderer.init(canvas)
  return renderer
}
