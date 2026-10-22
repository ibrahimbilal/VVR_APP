import { cancelJob, getJob, type JobStatus } from './api'

export interface JobPollUpdate {
  phase?: string
  progress?: number
  message?: string
  error?: string | null
  warning?: string | null
  downloadUrl?: string | null
  bytes?: number | null
  jobId?: string | null
  encoder?: string | null
  hardware?: boolean | null
  encodeFps?: number | null
  encodeSpeed?: number | null
  elapsedSec?: number | null
  etaSec?: number | null
  stage?: string | null
}

export function mapJobToProgress(job: JobStatus, uploadProgress = 0.16): JobPollUpdate {
  let progress = uploadProgress
  if (job.status === 'preparing') progress = 0.2
  if (job.status === 'rendering') progress = 0.2 + job.progress * 0.75
  if (job.status === 'verifying') progress = 0.97
  if (job.status === 'done') progress = 1
  const phase = job.status === 'queued' ? 'queued' : job.status
  return {
    phase,
    progress,
    message: job.queuePosition > 1 ? `Waiting in the render queue (position ${job.queuePosition}).` : job.message,
    error: job.error,
    warning: job.warning,
    jobId: job.id,
    bytes: job.outputBytes,
    encoder: job.encoder ?? null,
    hardware: job.hardware ?? null,
    encodeFps: job.encodeFps ?? null,
    encodeSpeed: job.encodeSpeed ?? null,
    elapsedSec: job.elapsedSec ?? null,
    etaSec: job.etaSec ?? null,
    stage: job.stage ?? null,
  }
}

export async function pollJobUntilDone(
  jobId: string,
  signal: AbortSignal,
  onUpdate: (patch: JobPollUpdate) => void,
  uploadProgress = 0.16,
): Promise<JobStatus> {
  const onAbort = () => {
    void cancelJob(jobId)
  }
  signal.addEventListener('abort', onAbort)
  try {
    let latest: JobStatus | null = null
    while (!signal.aborted) {
      latest = await getJob(jobId)
      onUpdate(mapJobToProgress(latest, uploadProgress))
      if (latest.status === 'done' || latest.status === 'error' || latest.status === 'cancelled') break
      await wait(700, signal)
    }
    if (signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
    if (!latest || latest.status === 'cancelled') {
      onUpdate({ phase: 'cancelled', message: 'Export cancelled.', error: null })
      throw new DOMException('The export was cancelled.', 'AbortError')
    }
    if (latest.status === 'error') throw new Error(latest.error || 'Rendering failed.')
    onUpdate({
      phase: 'done',
      progress: 1,
      message: 'Export verified.',
      downloadUrl: `/api/jobs/${latest.id}/download`,
      bytes: latest.outputBytes,
      warning: latest.warning,
      jobId: latest.id,
      error: null,
    })
    return latest
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('The export was cancelled.', 'AbortError'))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
