import { PENDING_ASSET_REF, type ThumbnailFit, type ThumbnailLinkMode, type ThumbnailSourceApp } from '@shared/thumbnailProject'
import { validateThumbnailTransfer } from '@shared/thumbnailTransfer'
import type { ScreensaverComposition } from '@shared/screensaverComposition'
import { router } from '../../../app/router'
import { deleteThumbnailValue, loadThumbnailValue, saveThumbnailValue } from '../../../lib/idb'
import { usePlatformStore } from '../../../stores/platform'
import { useThumbnailStore } from '../stores/thumbnail'
import { releasePendingAssets, storeImageBlob } from './assetStore'

export interface StageThumbnailInput {
  sourceApp: ThumbnailSourceApp
  sourceProjectId?: string
  linkMode: ThumbnailLinkMode
  returnPath:
    | '/'
    | '/shorts'
    | '/ranking-videos'
    | '/frame-screensaver'
    | '/screensaver'
    | '/thumbnails'
    | '/thumbs'
    | '/thumbnail-studio'
  title?: string
  artwork: Blob
  artworkName?: string
  frame?: Blob | null
  frameName?: string
  composition?: ScreensaverComposition | null
  fit?: ThumbnailFit
  video?: { durationSeconds?: number; width?: number; height?: number }
}

export type StageThumbnailOptions = {
  navigate?: boolean
}

export async function stageThumbnailTransfer(input: StageThumbnailInput, options: StageThumbnailOptions = {}): Promise<void> {
  const platform = usePlatformStore()
  const studio = useThumbnailStore()
  await studio.init()
  const previous = await loadPendingIds()
  if (previous.length > 0) await releasePendingAssets(previous)
  const artwork = await storeImageBlob(input.artwork, input.artworkName || 'artwork', PENDING_ASSET_REF)
  let frameId: string | undefined
  if (input.frame) {
    const frame = await storeImageBlob(input.frame, input.frameName || 'frame', PENDING_ASSET_REF)
    frameId = frame.id
  }
  const validated = validateThumbnailTransfer({
    version: 1,
    sourceApp: input.sourceApp,
    sourceProjectId: input.sourceProjectId,
    linkMode: input.linkMode,
    returnPath: input.returnPath,
    title: input.title,
    artwork: { assetId: artwork.id, fit: input.fit, composition: input.composition ?? null },
    frame: frameId ? { assetId: frameId } : undefined,
    video: input.video,
  })
  if (!validated.ok) {
    await releasePendingAssets([artwork.id, frameId].filter((id): id is string => Boolean(id)))
    throw new Error(validated.error)
  }
  await saveThumbnailValue('pending-transfer', validated.payload)
  const shouldNavigate = options.navigate !== false
  if (!shouldNavigate) {
    await studio.applyScreensaverTransfer(validated.payload)
    return
  }
  if (router.currentRoute.value.path === '/thumbnails') await studio.consumeStoredTransfer()
  else await router.push('/thumbnails')
  platform.toast('Thumbnail project ready.', 'info')
}

async function loadPendingIds(): Promise<string[]> {
  const stored = await loadThumbnailValue<unknown>('pending-transfer')
  const validated = validateThumbnailTransfer(stored)
  if (!validated.ok) {
    if (stored) await deleteThumbnailValue('pending-transfer')
    return []
  }
  const ids = [validated.payload.artwork.assetId]
  if (validated.payload.frame?.assetId) ids.push(validated.payload.frame.assetId)
  return ids
}
