import { cancelJob, startAudioLooperExport } from '../../../lib/api'
import { pollJobUntilDone, type JobPollUpdate } from '../../../lib/jobPoll'
import type { AudioLooperSettings } from '@shared/audioLooper'

export type AudioLooperExportUpdate = JobPollUpdate

export async function submitAudioLooperExport(input: {
  files: File[]
  settings: AudioLooperSettings
  signal: AbortSignal
  onUpdate: (patch: AudioLooperExportUpdate) => void
}): Promise<string> {
  const body = new FormData()
  if (input.files.length <= 1) {
    const file = input.files[0]
    if (file) body.append('file', file, file.name)
  } else {
    for (const file of input.files) body.append('files', file, file.name)
  }
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

export async function requestAudioLooperPreview(input: {
  files: File[]
  settings: AudioLooperSettings
  signal: AbortSignal
}): Promise<Blob> {
  const body = new FormData()
  for (const file of input.files) body.append('files', file, file.name)
  body.append('settings', JSON.stringify(input.settings))
  const response = await fetch('/api/audio-looper/preview', { method: 'POST', body, signal: input.signal })
  if (!response.ok) {
    let message = `Request failed (${response.status}).`
    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // The body was not JSON.
    }
    throw new Error(message)
  }
  return response.blob()
}

export async function runAudioLooperExport(input: {
  files: File[]
  settings: AudioLooperSettings
  signal: AbortSignal
  onUpdate: (patch: AudioLooperExportUpdate) => void
}): Promise<void> {
  const jobId = await submitAudioLooperExport(input)
  await pollJobUntilDone(jobId, input.signal, input.onUpdate, 0.16)
}
