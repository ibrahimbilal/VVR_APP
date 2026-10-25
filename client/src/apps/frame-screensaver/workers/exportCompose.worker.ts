import type { ScreensaverComposition } from '@shared/screensaverComposition'
import { bakePlacement, canvasToPng, paintComposition } from '../lib/composeCanvas'

export interface ExportComposeRequest {
  id: number
  width: number
  height: number
  composition: ScreensaverComposition
  frameWidth: number
  frameHeight: number
  framePixels: Uint8ClampedArray | null
}

export interface ExportComposeResponse {
  id: number
  ok: boolean
  blob?: Blob
  error?: string
}

self.onmessage = async (event: MessageEvent<ExportComposeRequest & { bitmap: ImageBitmap }>) => {
  const { id, width, height, composition, bitmap, frameWidth, frameHeight, framePixels } = event.data
  try {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create offscreen canvas.')
    const baked = bakePlacement(bitmap, bitmap.width, bitmap.height, composition, width, height, false)
    let frame: CanvasImageSource | null = null
    if (framePixels && frameWidth > 0 && frameHeight > 0) {
      const frameCanvas = new OffscreenCanvas(frameWidth, frameHeight)
      const frameCtx = frameCanvas.getContext('2d')
      if (frameCtx) {
        const pixels = new Uint8ClampedArray(framePixels)
        frameCtx.putImageData(new ImageData(pixels, frameWidth, frameHeight), 0, 0)
        frame = frameCanvas
      }
    }
    paintComposition(ctx, baked, bitmap, bitmap.width, bitmap.height, composition, {
      flatten: true,
      checker: false,
      frame,
    })
    bitmap.close()
    const blob = await canvasToPng(canvas)
    const response: ExportComposeResponse = { id, ok: true, blob }
    self.postMessage(response)
  } catch (error) {
    bitmap.close()
    const response: ExportComposeResponse = { id, ok: false, error: error instanceof Error ? error.message : 'Export compose failed.' }
    self.postMessage(response)
  }
}
