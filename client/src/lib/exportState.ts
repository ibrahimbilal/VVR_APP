import type { ExportPhase, ExportState } from '../types'
import type { JobPollUpdate } from './jobPoll'

export const ACTIVE_EXPORT_PHASES: ReadonlySet<ExportPhase> = new Set([
  'overlays',
  'uploading',
  'queued',
  'preparing',
  'rendering',
  'verifying',
])

export function idleExport(): ExportState {
  return {
    phase: 'idle',
    progress: 0,
    message: '',
    error: null,
    warning: null,
    downloadUrl: null,
    bytes: null,
    jobId: null,
    encoder: null,
    hardware: null,
    encodeFps: null,
    encodeSpeed: null,
    elapsedSec: null,
    etaSec: null,
    stage: null,
    encodeProgress: null,
  }
}

export function isActiveExportPhase(phase: ExportPhase): boolean {
  return ACTIVE_EXPORT_PHASES.has(phase)
}

export function exportStateFromPoll(patch: JobPollUpdate): ExportState {
  const base = idleExport()
  return {
    ...base,
    phase: (patch.phase as ExportPhase) ?? base.phase,
    progress: patch.progress ?? base.progress,
    message: patch.message ?? base.message,
    error: patch.error ?? base.error,
    warning: patch.warning ?? base.warning,
    downloadUrl: patch.downloadUrl ?? base.downloadUrl,
    bytes: patch.bytes ?? base.bytes,
    jobId: patch.jobId ?? base.jobId,
    encoder: patch.encoder ?? base.encoder,
    hardware: patch.hardware ?? base.hardware,
    encodeFps: patch.encodeFps ?? base.encodeFps,
    encodeSpeed: patch.encodeSpeed ?? base.encodeSpeed,
    elapsedSec: patch.elapsedSec ?? base.elapsedSec,
    etaSec: patch.etaSec ?? base.etaSec,
    stage: patch.stage ?? base.stage,
    encodeProgress: patch.encodeProgress ?? base.encodeProgress,
  }
}

export function pickDisplayExportState(jobs: { state: ExportState }[]): ExportState {
  const active = jobs.find((job) => isActiveExportPhase(job.state.phase) || job.state.phase === 'idle')
  if (active) return active.state
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index]
    if (job && job.state.phase === 'done') return job.state
  }
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index]
    if (job && job.state.phase === 'error') return job.state
  }
  return idleExport()
}
