import { nearestDurationBadgeLabel, normalizeResolutionBadgeText, normalizeThumbnailBadgeLabels } from './thumbnailBadges'
import { sanitizeComposition, type ScreensaverComposition } from './screensaverComposition'
import {
  createThumbnailDocument,
  qualityFromResolution,
  type ThumbnailDocument,
  type ThumbnailFit,
  type ThumbnailLinkMode,
  type ThumbnailSourceApp,
} from './thumbnailProject'

export const THUMBNAIL_TRANSFER_VERSION = 1

const RETURN_PATHS = new Set(['/', '/ranking-videos', '/frame-screensaver', '/thumbnail-studio'])

export interface ThumbnailTransferPayload {
  version: 1
  sourceApp: ThumbnailSourceApp
  sourceProjectId?: string
  linkMode: ThumbnailLinkMode
  returnPath?: string
  title?: string
  artwork: {
    assetId: string
    fit?: ThumbnailFit
    composition?: ScreensaverComposition | null
  }
  frame?: {
    assetId?: string
  }
  video?: {
    durationSeconds?: number
    width?: number
    height?: number
  }
}

export function validateThumbnailTransfer(raw: unknown): { ok: true; payload: ThumbnailTransferPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Thumbnail transfer data is missing.' }
  const data = raw as Record<string, unknown>
  if (data.version !== THUMBNAIL_TRANSFER_VERSION) {
    return { ok: false, error: 'This thumbnail transfer is from an unsupported version.' }
  }
  if (data.sourceApp !== 'frame-screensaver' && data.sourceApp !== 'ranking-videos' && data.sourceApp !== 'standalone') {
    return { ok: false, error: 'Unknown thumbnail source.' }
  }
  const artworkRaw = data.artwork
  if (!artworkRaw || typeof artworkRaw !== 'object') return { ok: false, error: 'Thumbnail transfer has no artwork.' }
  const assetId = (artworkRaw as { assetId?: unknown }).assetId
  if (typeof assetId !== 'string' || !assetId.trim()) return { ok: false, error: 'Thumbnail transfer has no artwork.' }

  const payload: ThumbnailTransferPayload = {
    version: 1,
    sourceApp: data.sourceApp,
    linkMode: data.linkMode === 'linked' ? 'linked' : 'snapshot',
    artwork: { assetId: assetId.trim() },
  }
  const sourceProjectId = optionalText(data.sourceProjectId, 80)
  if (sourceProjectId) payload.sourceProjectId = sourceProjectId
  const title = optionalText(data.title, 120)
  if (title) payload.title = title
  if (typeof data.returnPath === 'string' && RETURN_PATHS.has(data.returnPath)) payload.returnPath = data.returnPath

  const fit = (artworkRaw as { fit?: unknown }).fit
  if (fit === 'contain' || fit === 'cover') payload.artwork.fit = fit
  const composition = sanitizeComposition((artworkRaw as { composition?: unknown }).composition)
  if (composition) payload.artwork.composition = composition

  const frameRaw = data.frame
  if (frameRaw && typeof frameRaw === 'object') {
    const frameId = optionalText((frameRaw as { assetId?: unknown }).assetId, 80)
    if (frameId) payload.frame = { assetId: frameId }
  }

  const videoRaw = data.video
  if (videoRaw && typeof videoRaw === 'object') {
    const video = videoRaw as { durationSeconds?: unknown; width?: unknown; height?: unknown }
    const durationSeconds = positiveNumber(video.durationSeconds)
    const width = positiveNumber(video.width)
    const height = positiveNumber(video.height)
    if (durationSeconds || width || height) {
      payload.video = {}
      if (durationSeconds) payload.video.durationSeconds = durationSeconds
      if (width) payload.video.width = Math.round(width)
      if (height) payload.video.height = Math.round(height)
    }
  }
  return { ok: true, payload }
}

export function documentFromTransfer(payload: ThumbnailTransferPayload, id?: string): ThumbnailDocument {
  const doc = createThumbnailDocument()
  if (id) doc.id = id
  doc.image.assetId = payload.artwork.assetId
  doc.image.fit = payload.artwork.fit ?? 'cover'
  doc.image.composition = payload.artwork.composition ?? null
  if (payload.artwork.composition) doc.image.crop = { ...payload.artwork.composition.crop }
  doc.image.frameAssetId = payload.frame?.assetId ?? null
  doc.source.app = payload.sourceApp
  doc.source.linkMode = payload.linkMode
  doc.source.returnPath = payload.returnPath ?? null
  doc.source.sourceProjectId = payload.sourceProjectId ?? null
  doc.source.videoWidth = payload.video?.width ?? null
  doc.source.videoHeight = payload.video?.height ?? null
  doc.source.durationSeconds = payload.video?.durationSeconds ?? null
  if (doc.source.videoWidth && doc.source.videoHeight) {
    const quality = qualityFromResolution(doc.source.videoWidth, doc.source.videoHeight)
    doc.resolution.text = normalizeResolutionBadgeText(quality.label, doc.source.videoWidth, doc.source.videoHeight)
  }
  if (doc.source.durationSeconds != null) {
    doc.duration.text = nearestDurationBadgeLabel(doc.source.durationSeconds)
  }
  doc.resolution.enabled = true
  doc.duration.enabled = true
  doc.updatedAt = Date.now()
  return normalizeThumbnailBadgeLabels(doc)
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number
}
