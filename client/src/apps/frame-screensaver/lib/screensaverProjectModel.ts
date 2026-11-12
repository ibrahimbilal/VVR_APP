export type ScreensaverProjectStatus = 'draft' | 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled'

export interface ScreensaverRenderState {
  status: ScreensaverProjectStatus
  progress: number
  trackId: string | null
  jobId: string | null
  outputUrl: string | null
  outputFilename: string | null
  error: string | null
  outputMissing: boolean
  /** Export fingerprint when the user last downloaded the output. */
  downloadedFingerprint: string | null
}

export interface ScreensaverRenderEvent {
  projectId: string
  trackId: string
  phase: string
  progress: number
  error: string | null
  jobId: string | null
  downloadUrl: string | null
  filename: string | null
}

export function draftRender(): ScreensaverRenderState {
  return {
    status: 'draft',
    progress: 0,
    trackId: null,
    jobId: null,
    outputUrl: null,
    outputFilename: null,
    error: null,
    outputMissing: false,
    downloadedFingerprint: null,
  }
}

export function statusFromExportPhase(phase: string): ScreensaverProjectStatus {
  switch (phase) {
    case 'done':
      return 'completed'
    case 'error':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'idle':
    case 'queued':
      return 'queued'
    default:
      return 'rendering'
  }
}

export function isLiveRenderStatus(status: ScreensaverProjectStatus): boolean {
  return status === 'queued' || status === 'rendering'
}

export const SCREENSAVER_STATUS_LABEL: Record<ScreensaverProjectStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  rendering: 'Rendering',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export function mediaCountLabel(mediaKind: 'image' | 'video' | null): string {
  if (mediaKind === 'image') return '1 image'
  if (mediaKind === 'video') return '1 video'
  return 'No media'
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** A new export adopts this track. Older tracks stop updating the project. */
export function bindRenderTrack(current: ScreensaverRenderState, trackId: string): ScreensaverRenderState {
  return {
    ...current,
    status: 'queued',
    progress: 0,
    trackId,
    jobId: null,
    error: null,
  }
}

/**
 * Apply one render event to the project it names.
 * Returns null when the event belongs to an older track than the one this project is following.
 */
export function applyExportToRender(
  current: ScreensaverRenderState,
  event: ScreensaverRenderEvent,
): ScreensaverRenderState | null {
  const sameJob = Boolean(current.jobId && event.jobId && current.jobId === event.jobId)
  if (current.trackId && current.trackId !== event.trackId && !sameJob) return null

  const status = statusFromExportPhase(event.phase)
  const next: ScreensaverRenderState = {
    ...current,
    status,
    progress: status === 'completed' ? 1 : clampProgress(event.progress),
    trackId: event.trackId,
    jobId: event.jobId ?? current.jobId,
    error: status === 'failed' ? event.error || 'Export failed.' : null,
  }

  if (status === 'completed' && event.downloadUrl) {
    next.outputUrl = event.downloadUrl
    next.outputFilename = event.filename
    next.outputMissing = false
  }

  return next
}
