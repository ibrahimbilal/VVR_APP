import { sanitizeComposition, type ScreensaverComposition } from './screensaverComposition'
import {
  artworkLayer,
  createThumbnailProject,
  frameLayer,
  type ThumbnailFit,
  type ThumbnailLinkMode,
  type ThumbnailProject,
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

export function projectFromTransfer(payload: ThumbnailTransferPayload, id?: string): ThumbnailProject {
  const project = createThumbnailProject(payload.title?.trim() || 'Untitled thumbnail')
  if (id) project.id = id
  project.linkMode = payload.linkMode
  project.sourceApp = payload.sourceApp
  project.sourceProjectId = payload.sourceProjectId ?? null
  project.returnPath = payload.returnPath ?? null
  project.name = payload.title?.trim() || project.name
  project.videoWidth = payload.video?.width ?? null
  project.videoHeight = payload.video?.height ?? null
  project.durationSeconds = payload.video?.durationSeconds ?? null

  const artwork = artworkLayer(project)
  if (artwork) {
    artwork.assetId = payload.artwork.assetId
    artwork.fit = payload.artwork.fit ?? 'cover'
    artwork.composition = payload.artwork.composition ?? null
    if (payload.artwork.composition) artwork.crop = { ...payload.artwork.composition.crop }
  }
  const frame = frameLayer(project)
  if (frame && payload.frame?.assetId) {
    frame.assetId = payload.frame.assetId
    frame.visible = true
  }
  const title = project.layers.find((item) => item.textRole === 'title')
  if (title) {
    title.text = project.name
    title.userEdited = false
  }
  const duration = project.layers.find((item) => item.badgeRole === 'duration')
  if (duration) duration.visible = project.durationSeconds != null
  if (payload.artwork.composition) applyCompositionBackground(project, payload.artwork.composition)
  project.updatedAt = Date.now()
  return project
}

function applyCompositionBackground(project: ThumbnailProject, composition: ScreensaverComposition): void {
  const background = project.layers.find((item) => item.kind === 'background')
  if (!background) return
  const mode = composition.background.mode
  background.blur = 0
  if (mode === 'blur') {
    background.blur = composition.background.blur
    background.boxStyle.fill = 'solid'
    background.boxStyle.color = composition.background.color
    background.boxStyle.color2 = composition.background.color
    return
  }
  if (mode === 'transparent') {
    background.boxStyle.fill = 'none'
    return
  }
  const color = mode === 'white' ? '#ffffff' : mode === 'black' ? '#000000' : composition.background.color
  background.boxStyle.fill = 'solid'
  background.boxStyle.color = color
  background.boxStyle.color2 = color
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
