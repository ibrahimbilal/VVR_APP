import { frameMetrics } from '@shared/frame'
import type { ThumbnailDocument } from '@shared/thumbnailProject'
import { playbackOrder } from './order'
import type { Clip, ProjectStyle, TitleSpan } from '../types'

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof File) return fileKey(value)
  if (Array.isArray(value)) return value.map(sortValue)
  const record = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortValue(record[key])
  }
  return sorted
}

export function stableExportFingerprint(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

export function rankingExportFingerprint(
  clips: Clip[],
  style: ProjectStyle,
  spans: TitleSpan[],
  musicFile: File | null,
): string {
  const metrics = frameMetrics(
    style.video.width,
    style.video.height,
    style.banner.visible === false ? 0 : style.banner.height,
  )
  const styleSnapshot = {
    ...style,
    banner: { ...style.banner, height: metrics.bannerHeight },
    video: { ...style.video, width: metrics.width, height: metrics.height },
  }
  const ordered = playbackOrder(clips)
  return stableExportFingerprint({
    clips: ordered.map((clip) => ({
      serverId: clip.serverId,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      playAtEnd: clip.playAtEnd,
      rankColor: clip.rankColor,
      titleColor: clip.titleColor,
      title: clip.title,
    })),
    style: styleSnapshot,
    spans,
    music: musicFile ? fileKey(musicFile) : null,
  })
}

export function screensaverExportFingerprint(
  projectJson: Record<string, unknown>,
  audioFile: File | null,
): string {
  return stableExportFingerprint({
    project: projectJson,
    audio: audioFile ? fileKey(audioFile) : null,
  })
}

export function thumbnailExportFingerprint(doc: ThumbnailDocument): string {
  const { id: _id, updatedAt: _updatedAt, ...content } = doc
  return stableExportFingerprint(content)
}

export const DUPLICATE_EXPORT_MESSAGE = 'Change the project before exporting again.'
