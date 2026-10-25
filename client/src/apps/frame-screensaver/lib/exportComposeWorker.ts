import type { ScreensaverComposition } from '@shared/screensaverComposition'
import { toRaw } from 'vue'
import { bakePlacement, canvasToPng, paintComposition } from './composeCanvas'
import { recordExportPrep } from './previewMetrics'
import type { ExportComposeResponse } from '../workers/exportCompose.worker'

function cloneComposition(composition: ScreensaverComposition): ScreensaverComposition {
  return structuredClone(toRaw(composition))
}

const EXPORT_PIXEL_THRESHOLD = 1920 * 1080

let worker: Worker | null = null
let requestId = 0

function workerAvailable(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/exportCompose.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function shouldOffloadExportCompose(width: number, height: number): boolean {
  return width * height > EXPORT_PIXEL_THRESHOLD && workerAvailable()
}

export async function composeExportPng(input: {
  bitmap: ImageBitmap
  width: number
  height: number
  composition: ScreensaverComposition
  frame: HTMLImageElement | null
}): Promise<Blob> {
  const useWorker = shouldOffloadExportCompose(input.width, input.height)
  const started = performance.now()
  if (useWorker) {
    const id = ++requestId
    const composition = cloneComposition(input.composition)
    const framePixels = input.frame
      ? await readImagePixels(input.frame, input.width, input.height)
      : { data: null, width: 0, height: 0 }
    const frameCopy = framePixels.data ? new Uint8ClampedArray(framePixels.data) : null
    const transfers: Transferable[] = [input.bitmap]
    if (frameCopy?.buffer) transfers.push(frameCopy.buffer)
    const blob = await new Promise<Blob>((resolve, reject) => {
      const w = getWorker()
      const onMessage = (event: MessageEvent<ExportComposeResponse>) => {
        if (event.data.id !== id) return
        w.removeEventListener('message', onMessage)
        w.removeEventListener('error', onError)
        if (event.data.ok && event.data.blob) resolve(event.data.blob)
        else reject(new Error(event.data.error ?? 'Worker export failed.'))
      }
      const onError = () => {
        w.removeEventListener('message', onMessage)
        w.removeEventListener('error', onError)
        reject(new Error('Export worker failed.'))
      }
      w.addEventListener('message', onMessage)
      w.addEventListener('error', onError)
      try {
        w.postMessage(
          {
            id,
            width: input.width,
            height: input.height,
            composition,
            bitmap: input.bitmap,
            frameWidth: framePixels.width,
            frameHeight: framePixels.height,
            framePixels: frameCopy,
          },
          transfers,
        )
      } catch (error) {
        w.removeEventListener('message', onMessage)
        w.removeEventListener('error', onError)
        reject(error instanceof Error ? error : new Error('Could not send work to the export worker.'))
      }
    })
    recordExportPrep(performance.now() - started, true)
    return blob
  }

  const composition = cloneComposition(input.composition)
  const baked = bakePlacement(input.bitmap, input.bitmap.width, input.bitmap.height, composition, input.width, input.height, false)
  const canvas = document.createElement('canvas')
  canvas.width = input.width
  canvas.height = input.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the composition.')
  paintComposition(ctx, baked, input.bitmap, input.bitmap.width, input.bitmap.height, composition, {
    flatten: true,
    checker: false,
    frame: input.frame,
  })
  input.bitmap.close()
  const blob = await canvasToPng(canvas)
  recordExportPrep(performance.now() - started, false)
  return blob
}

async function readImagePixels(
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
): Promise<{ data: Uint8ClampedArray | null; width: number; height: number }> {
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return { data: null, width: 0, height: 0 }
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  return { data: imageData.data, width: targetWidth, height: targetHeight }
}
