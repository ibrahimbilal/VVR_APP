import { saveShortsMode } from '../../image-motion-shorts/lib/shortsMode'
import { useImageMotionStore } from '../../image-motion-shorts/stores/imageMotion'
import { usePlatformStore } from '../../../stores/platform'
import { composeExportPng } from './exportComposeWorker'
import { frameImageUrl } from './frameImageUrl'
import { useScreensaverStore } from '../stores/screensaver'

const MAX_IMAGE_BYTES = 80 * 1024 * 1024

export async function sendScreensaverImageToImageMotion(_screensaverProjectId?: string): Promise<void> {
  const imageMotion = useImageMotionStore()
  const platform = usePlatformStore()
  try {
    const file = await framedScreensaverFile()
    await imageMotion.importFromScreensaver(file)
    saveShortsMode('image-motion')
    platform.toast('Image added to Image Motion.', 'success')
  } catch (error) {
    platform.toast(error instanceof Error ? error.message : 'Could not send the image to Image Motion.', 'error')
  }
}

async function framedScreensaverFile(): Promise<File> {
  const store = useScreensaverStore()
  if (store.mediaKind !== 'image' || !store.objectUrl) {
    throw new Error('Add an image before sending it to Image Motion.')
  }
  const image = await loadHtmlImage(store.objectUrl)
  const bitmap = await createImageBitmap(image)
  const frameId = store.composition.frameId
  const frame = frameId && frameId !== 'none' ? await loadHtmlImage(frameImageUrl(frameId)) : null
  let blob = await composeExportPng({
    bitmap,
    width: store.outputWidth,
    height: store.outputHeight,
    composition: store.composition,
    frame,
  })
  const base = (store.fileName || 'screensaver').replace(/\.[^.]+$/, '')
  if (blob.size > MAX_IMAGE_BYTES) {
    blob = await shrinkToJpeg(blob)
    return new File([blob], `${base}-framed.jpg`, { type: 'image/jpeg' })
  }
  return new File([blob], `${base}-framed.png`, { type: 'image/png' })
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read the screensaver image.'))
    image.src = url
  })
}

async function shrinkToJpeg(png: Blob): Promise<Blob> {
  const image = await loadHtmlImage(URL.createObjectURL(png))
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the framed image.')
  ctx.drawImage(image, 0, 0)
  URL.revokeObjectURL(image.src)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('Could not prepare the framed image.')
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('The framed image is larger than 80 MB.')
  return blob
}
