import type { ExportPhase } from '../types'

const LOCAL_PREP_PHASES: ReadonlySet<ExportPhase> = new Set(['overlays', 'uploading', 'preparing'])

export type ExportButtonMode = 'export' | 'busy' | 'download'

export function resolveExportButtonMode(input: {
  phase: ExportPhase
  hasDownload: boolean
  activeExportCount: number
}): ExportButtonMode {
  if (input.phase === 'done' && input.hasDownload && input.activeExportCount <= 1) return 'download'
  if (LOCAL_PREP_PHASES.has(input.phase)) return 'busy'
  return 'export'
}

export function isLocalPrepPhase(phase: ExportPhase): boolean {
  return LOCAL_PREP_PHASES.has(phase)
}
