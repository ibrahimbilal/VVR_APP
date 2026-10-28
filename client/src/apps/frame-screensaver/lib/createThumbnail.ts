import type { ScreensaverComposition } from '@shared/screensaverComposition'
import { screensaverFrameUrl } from '../../../lib/api'
import { usePlatformStore } from '../../../stores/platform'
import { stageThumbnailTransfer } from '../../thumbnail-studio/lib/stageTransfer'
import { useScreensaverStore } from '../stores/screensaver'

export async function createThumbnailFromScreensaver(linkMode: 'snapshot' | 'linked'): Promise<void> {
  const store = useScreensaverStore()
  const platform = usePlatformStore()
  try {
    let artwork: Blob | null = null
    let composition: ScreensaverComposition | null = null
    if (store.mediaKind === 'image' && store.objectUrl) {
      const response = await fetch(store.objectUrl)
      if (!response.ok) throw new Error('Could not read the screensaver image.')
      artwork = await response.blob()
      composition = JSON.parse(JSON.stringify(store.composition)) as ScreensaverComposition
    } else if (store.thumbnail?.startsWith('data:')) {
      artwork = await (await fetch(store.thumbnail)).blob()
    }
    if (!artwork) throw new Error('Add an image before creating a thumbnail.')
    let frame: Blob | null = null
    const frameId = store.composition.frameId
    if (frameId && frameId !== 'none') {
      const response = await fetch(screensaverFrameUrl(frameId))
      if (response.ok) frame = await response.blob()
      else platform.toast('The decorative frame was not available, so the thumbnail continues without it.', 'info')
    }
    await stageThumbnailTransfer({
      sourceApp: 'frame-screensaver',
      sourceProjectId: 'frame-screensaver',
      linkMode,
      returnPath: '/frame-screensaver',
      title: store.name,
      artwork,
      artworkName: store.fileName || 'artwork',
      frame,
      composition,
      fit: 'cover',
      video: {
        width: store.outputWidth,
        height: store.outputHeight,
        durationSeconds: store.durationSeconds,
      },
    })
  } catch (error) {
    platform.toast(error instanceof Error ? error.message : 'Could not create a thumbnail.')
  }
}
