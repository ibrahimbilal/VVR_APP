import { cancelJob, startAudioLooperExport } from '../../../lib/api'
import { pollJobUntilDone, type JobPollUpdate } from '../../../lib/jobPoll'
import type { AudioLooperSettings } from '@shared/audioLooper'

export type AudioLooperExportUpdate = JobPollUpdate

export async function submitAudioLooperExport(input: {
  file: File
  settings: AudioLooperSettings
  signal: AbortSignal
  onUpdate: (patch: AudioLooperExportUpdate) => void
}): Promise<string> {
  const body = new FormData()
  body.append('file', input.file, input.file.name)
  body.append('settings', JSON.stringify(input.settings))
  input.onUpdate({
    phase: 'uploading',
    progress: 0.04,
    message: 'Uploading audio.',
    error: null,
    warning: null,
    downloadUrl: null,
  })
  const started = await startAudioLooperExport(
    body,
    (fraction) => {
      input.onUpdate({ progress: 0.04 + fraction * 0.12 })
    },
    input.signal,
  )
  if (input.signal.aborted) {
    await cancelJob(started.jobId)
    throw new DOMException('The export was cancelled.', 'AbortError')
  }
  return started.jobId
}

export async function runAudioLooperExport(input: {
  file: File
  settings: AudioLooperSettings
  signal: AbortSignal
  onUpdate: (patch: AudioLooperExportUpdate) => void
}): Promise<void> {
  const jobId = await submitAudioLooperExport(input)
  await pollJobUntilDone(jobId, input.signal, input.onUpdate, 0.16)
}
