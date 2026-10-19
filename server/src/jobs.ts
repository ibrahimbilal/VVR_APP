import { rm } from 'node:fs/promises'
import path from 'node:path'
import { releaseClips, retainClips, jobsDir, outputsDir } from './storage'
import { renderProject, type RenderRequest } from './render'

export type JobStatus = 'queued' | 'preparing' | 'rendering' | 'verifying' | 'done' | 'error' | 'cancelled'

export interface JobView {
  id: string
  status: JobStatus
  progress: number
  message: string
  error: string | null
  warning: string | null
  outputBytes: number | null
  outputDuration: number | null
  queuePosition: number
  downloadName: string
}

interface Job extends RenderRequest {
  id: string
  status: JobStatus
  progress: number
  message: string
  error: string | null
  warning: string | null
  outputBytes: number | null
  outputDuration: number | null
  outputPath: string | null
  downloadName: string
  cancelRequested: boolean
  kill: (() => void) | null
  createdAt: number
}

const jobs = new Map<string, Job>()
const queue: string[] = []
let pumping = false
let activeId: string | null = null

export function createJob(id: string, input: RenderRequest & { downloadName: string }): JobView {
  const job: Job = {
    ...input,
    id,
    status: 'queued',
    progress: 0,
    message: 'Waiting to render.',
    error: null,
    warning: null,
    outputBytes: null,
    outputDuration: null,
    outputPath: null,
    downloadName: input.downloadName,
    cancelRequested: false,
    kill: null,
    createdAt: Date.now(),
  }
  jobs.set(id, job)
  retainClips(input.clips.map((clip) => clip.id))
  queue.push(id)
  void pump()
  return view(job)
}

export function getJob(id: string): JobView | null {
  const job = jobs.get(id)
  return job ? view(job) : null
}

export function jobOutput(id: string): { path: string; name: string } | null {
  const job = jobs.get(id)
  if (!job || job.status !== 'done' || !job.outputPath) return null
  return { path: job.outputPath, name: `${job.downloadName}.mp4` }
}

export function cancelJob(id: string): JobView | null {
  const job = jobs.get(id)
  if (!job) return null
  if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return view(job)
  job.cancelRequested = true
  job.status = 'cancelled'
  job.message = 'Cancelling.'
  job.kill?.()
  return view(job)
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (queue.length > 0) {
      const id = queue.shift()
      if (!id) break
      const job = jobs.get(id)
      if (!job || job.status === 'cancelled') {
        if (job) await finish(job)
        continue
      }
      activeId = id
      try {
        const result = await renderProject(job, {
          cancelled: () => job.cancelRequested || job.status === 'cancelled',
          onProgress: (progress, message) => {
            if (job.cancelRequested) return
            job.progress = progress
            if (message) job.message = message
          },
          onStatus: (status, message) => {
            if (job.cancelRequested && status !== 'cancelled') return
            job.status = status
            job.message = message
          },
          registerKill: (kill) => {
            job.kill = kill
            if (job.cancelRequested) kill()
          },
        })
        if (job.cancelRequested) {
          job.status = 'cancelled'
          job.message = 'Render cancelled.'
        } else {
          job.status = 'done'
          job.progress = 1
          job.message = 'Export verified.'
          job.warning = result.warning
          job.outputPath = result.outputPath
          job.outputBytes = result.bytes
          job.outputDuration = result.duration
        }
      } catch (error) {
        if (job.cancelRequested || (error instanceof Error && error.name === 'RenderCancelled')) {
          job.status = 'cancelled'
          job.message = 'Render cancelled.'
          job.error = null
        } else {
          job.status = 'error'
          job.progress = 0
          job.error = error instanceof Error ? error.message : 'Rendering failed.'
          job.message = job.error
        }
      } finally {
        activeId = null
        job.kill = null
        await finish(job)
      }
    }
  } finally {
    pumping = false
  }
}

async function finish(job: Job): Promise<void> {
  releaseClips(job.clips.map((clip) => clip.id))
  const dir = path.join(jobsDir, job.id)
  await rm(dir, { recursive: true, force: true })
  if (job.status !== 'done' && job.outputPath) {
    await rm(job.outputPath, { force: true })
    job.outputPath = null
  }
}

function view(job: Job): JobView {
  let queuePosition = 0
  if (job.status === 'queued') {
    const index = queue.indexOf(job.id)
    queuePosition = index === -1 ? 1 : index + 1
    if (activeId) queuePosition += 0
  }
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    warning: job.warning,
    outputBytes: job.outputBytes,
    outputDuration: job.outputDuration,
    queuePosition,
    downloadName: job.downloadName,
  }
}

export function outputFile(id: string): string {
  return path.join(outputsDir, `${id}.mp4`)
}
