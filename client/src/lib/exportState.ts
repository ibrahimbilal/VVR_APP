import type { ExportPhase, ExportState } from '../types'

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
  }
}

export function isActiveExportPhase(phase: ExportPhase): boolean {
  return ACTIVE_EXPORT_PHASES.has(phase)
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
