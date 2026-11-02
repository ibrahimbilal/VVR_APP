import {
  SUBSCRIBE_ANIMATION_FPS,
  SUBSCRIBE_ANIMATION_PNG_SIZE_FACTOR,
  subscribeAnimationFrameCount,
  type SubscribeAnimationSettings,
} from '@shared/screensaverSubscribeAnimation'
import { renderSubscribeAnimationAt } from './renderSubscribeAnimation'
import { subscribeAnimationLayout } from './subscribeAnimationLayout'

const BATCH_SIZE = 10

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode an animation frame.'))
    }, 'image/png')
  })
}

export async function renderSubscribeAnimationFrames(
  settings: SubscribeAnimationSettings,
  outputWidth: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob[]> {
  const layout = subscribeAnimationLayout(settings, outputWidth)
  const total = subscribeAnimationFrameCount(settings.durationSec)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available for animation export.')

  const frames: Blob[] = []
  for (let index = 0; index < total; index += 1) {
    const timeSec = index / SUBSCRIBE_ANIMATION_FPS
    renderSubscribeAnimationAt(ctx, timeSec, settings, layout)
    frames.push(await canvasToBlob(canvas))
    onProgress?.(index + 1, total)
    if ((index + 1) % BATCH_SIZE === 0) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
  }
  return frames
}

export function estimateSubscribeAnimationBytes(settings: SubscribeAnimationSettings, outputWidth: number): number {
  const layout = subscribeAnimationLayout(settings, outputWidth)
  const frames = subscribeAnimationFrameCount(settings.durationSec)
  const rawRgba = layout.width * layout.height * 4
  return Math.ceil(frames * rawRgba * SUBSCRIBE_ANIMATION_PNG_SIZE_FACTOR)
}
