import { fetchJob, listRecoverableJobs, type JobStatus } from './api'
import { exportStateFromPoll } from './exportState'
import { mapJobToProgress, pollJobUntilDone, type JobPollUpdate } from './jobPoll'
import { forgetRenderJob, loadPersistedRenderJobs, rememberRenderJob, type PersistedRenderJob } from './persistedRenderJobs'
import { notifyRenderReady, type RenderAppId } from './renderNotifications'
import {
  beginTrackedRender,
  endTrackedRender,
  registerRenderCancel,
  syncTrackedRender,
  unregisterRenderCancel,
} from './renderJobTracking'
import { usePlatformStore } from '../stores/platform'

type JobMeta = {
  app: RenderAppId
  projectName: string
  downloadFilename: string
}

const following = new Set<string>()

export async function resumePersistedRenderJobs(): Promise<void> {
  const platform = usePlatformStore()
  if (!platform.serverOnline) {
    await platform.refreshServer()
  }
  if (!platform.serverOnline) return

  const persistedById = new Map(loadPersistedRenderJobs().map((item) => [item.serverJobId, item]))
  let serverJobs: JobStatus[] = []
  try {
    serverJobs = await listRecoverableJobs()
  } catch {
    serverJobs = []
  }

  const ids = new Set<string>([...persistedById.keys(), ...serverJobs.map((job) => job.id)])
  if (ids.size === 0) return

  let inProgress = 0
  for (const serverJobId of ids) {
    if (following.has(serverJobId)) continue
    const persisted = persistedById.get(serverJobId)
    const listed = serverJobs.find((job) => job.id === serverJobId)
    let job: JobStatus | null = listed ?? null
    if (!job) {
      try {
        job = await fetchJob(serverJobId)
      } catch {
        continue
      }
    }
    if (!job) {
      if (persisted) forgetRenderJob(serverJobId)
      continue
    }

    const meta = resolveJobMeta(job, persisted)
    if (!meta) {
      forgetRenderJob(serverJobId)
      continue
    }

    if (job.status === 'error' || job.status === 'cancelled') {
      forgetRenderJob(serverJobId)
      continue
    }

    if (job.status === 'done') {
      finishReadyExport(meta, job)
      forgetRenderJob(serverJobId)
      continue
    }

    if (!persisted) {
      rememberRenderJob({
        serverJobId,
        app: meta.app,
        projectName: meta.projectName,
        downloadFilename: meta.downloadFilename,
      })
    }

    following.add(serverJobId)
    inProgress += 1
    void followServerJob(serverJobId, meta)
  }

  if (inProgress > 0) {
    platform.toast(
      inProgress === 1
        ? 'Reconnected to an export that was still running on the renderer.'
        : `Reconnected to ${inProgress} exports still on the renderer.`,
      'info',
    )
  }
}

function resolveJobMeta(job: JobStatus, persisted?: PersistedRenderJob): JobMeta | null {
  if (persisted) {
    return {
      app: persisted.app,
      projectName: persisted.projectName,
      downloadFilename: persisted.downloadFilename,
    }
  }
  const app = appFromJobKind(job.kind)
  if (!app) return null
  const name = job.downloadName.trim() || 'Untitled project'
  const ext = job.outputExt?.startsWith('.') ? job.outputExt : app === 'audio-looper' ? '.mp3' : '.mp4'
  return {
    app,
    projectName: name,
    downloadFilename: `${name}${ext}`,
  }
}

function appFromJobKind(kind: JobStatus['kind']): RenderAppId | null {
  if (kind === 'screensaver') return 'screensaver'
  if (kind === 'audio-looper') return 'audio-looper'
  if (kind === 'ranking') return 'ranking'
  return null
}

function finishReadyExport(meta: JobMeta, job: JobStatus): void {
  notifyRenderReady(meta.app, meta.projectName, `/api/jobs/${job.id}/download`, meta.downloadFilename)
}

async function followServerJob(serverJobId: string, meta: JobMeta): Promise<void> {
  const trackId = beginTrackedRender(meta.app, meta.projectName)
  const abort = new AbortController()
  registerRenderCancel(trackId, {
    abort: () => abort.abort(),
    getServerJobId: () => serverJobId,
  })

  const applyPoll = (patch: JobPollUpdate) => {
    syncTrackedRender(trackId, exportStateFromPoll(patch))
  }

  try {
    const initial = await fetchJob(serverJobId)
    if (!initial || initial.status === 'error' || initial.status === 'cancelled') {
      forgetRenderJob(serverJobId)
      return
    }
    if (initial.status === 'done') {
      finishReadyExport(meta, initial)
      forgetRenderJob(serverJobId)
      return
    }
    applyPoll(mapJobToProgress(initial))

    await pollJobUntilDone(serverJobId, abort.signal, applyPoll)
    finishReadyExport(meta, { ...initial, id: serverJobId, status: 'done' })
    forgetRenderJob(serverJobId)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      forgetRenderJob(serverJobId)
      return
    }
    const platform = usePlatformStore()
    const text = error instanceof Error ? error.message : 'Export failed.'
    platform.toast(text, 'error')
    forgetRenderJob(serverJobId)
  } finally {
    following.delete(serverJobId)
    unregisterRenderCancel(trackId)
    endTrackedRender(trackId)
  }
}
