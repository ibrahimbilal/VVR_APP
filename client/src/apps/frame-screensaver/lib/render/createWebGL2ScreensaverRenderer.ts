import type { ScreensaverRendererOptions } from './rendererOptions'
import { WebGL2ScreensaverRenderer } from './WebGL2ScreensaverRenderer'
import type { ScreensaverImageRenderer } from './types'

export async function createWebGL2ScreensaverRenderer(
  canvas: HTMLCanvasElement,
  options?: ScreensaverRendererOptions,
): Promise<ScreensaverImageRenderer> {
  const renderer = new WebGL2ScreensaverRenderer(options)
  await renderer.init(canvas)
  return renderer
}
