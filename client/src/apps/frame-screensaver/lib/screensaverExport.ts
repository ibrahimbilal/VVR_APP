import { cancelJob, startScreensaverExport } from '../../../lib/api'
import { pollJobUntilDone, type JobPollUpdate } from '../../../lib/jobPoll'
import type { ExportState } from '../../../types'

export type ScreensaverExportUpdate = JobPollUpdate & { phase?: ExportState['phase'] }

interface ScreensaverExportInput {
  projectJson: Record<string, unknown>
  audioFile: File | null
  compositionBlob: Blob | null
  frameBlob: Blob | null
  maskBlob: Blob | null
  signal: AbortSignal
  onUpdate: (patch: ScreensaverExportUpdate) => void
}

export async function runScreensaverExport(input: ScreensaverExportInput): Promise<void> {
  const body = new FormData()
  body.append('project', JSON.stringify(input.projectJson))
  if (input.audioFile) body.append('audio', input.audioFile, input.audioFile.name)
  if (input.compositionBlob) body.append('composition', input.compositionBlob, 'composition.png')
  if (input.frameBlob) body.append('frame', input.frameBlob, 'frame.png')
  if (input.maskBlob) body.append('mask', input.maskBlob, 'mask.png')

  input.onUpdate({ phase: 'uploading', progress: 0.05, message: 'Sending export settings.', error: null, warning: null, downloadUrl: null })
  const started = await startScreensaverExport(
    body,
    (fraction) => {
      input.onUpdate({ progress: 0.05 + fraction * 0.1 })
    },
    input.signal,
  )
  if (input.signal.aborted) {
    await cancelJob(started.jobId)
    throw new DOMException('The export was cancelled.', 'AbortError')
  }

  try {
    await pollJobUntilDone(started.jobId, input.signal, (patch) => {
      input.onUpdate(patch as ScreensaverExportUpdate)
    }, 0.16)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      input.onUpdate({ phase: 'cancelled', message: 'Export cancelled.', error: null })
      return
    }
    throw error
  }
}
