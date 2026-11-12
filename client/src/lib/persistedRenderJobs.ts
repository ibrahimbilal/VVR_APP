import type { RenderAppId } from './renderNotifications'

export type PersistedRenderJob = {
  serverJobId: string
  app: RenderAppId
  projectName: string
  downloadFilename: string
  savedAt: number
  projectId?: string | null
}

const STORAGE_KEY = 'vf-persisted-render-jobs'
const MAX_JOBS = 12

export function loadPersistedRenderJobs(): PersistedRenderJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as { jobs?: unknown }
    if (!Array.isArray(data.jobs)) return []
    const jobs: PersistedRenderJob[] = []
    for (const item of data.jobs) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const serverJobId = typeof row.serverJobId === 'string' ? row.serverJobId : ''
      const app =
        row.app === 'screensaver' || row.app === 'ranking' || row.app === 'audio-looper' ? row.app : null
      const projectName = typeof row.projectName === 'string' ? row.projectName : ''
      const downloadFilename = typeof row.downloadFilename === 'string' ? row.downloadFilename : ''
      if (!serverJobId || !app || !downloadFilename) continue
      jobs.push({
        serverJobId,
        app,
        projectName: projectName.trim() || 'Untitled project',
        downloadFilename,
        savedAt: typeof row.savedAt === 'number' ? row.savedAt : Date.now(),
        projectId: typeof row.projectId === 'string' ? row.projectId : null,
      })
    }
    return jobs.slice(0, MAX_JOBS)
  } catch {
    return []
  }
}

function writePersistedRenderJobs(jobs: PersistedRenderJob[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs: jobs.slice(0, MAX_JOBS) }))
  } catch {
    // ignore quota / private mode
  }
}

export function rememberRenderJob(input: Omit<PersistedRenderJob, 'savedAt'>): void {
  const next: PersistedRenderJob = {
    ...input,
    projectName: input.projectName.trim() || 'Untitled project',
    savedAt: Date.now(),
  }
  const jobs = loadPersistedRenderJobs().filter((item) => item.serverJobId !== next.serverJobId)
  jobs.unshift(next)
  writePersistedRenderJobs(jobs)
}

export function forgetRenderJob(serverJobId: string): void {
  const jobs = loadPersistedRenderJobs().filter((item) => item.serverJobId !== serverJobId)
  writePersistedRenderJobs(jobs)
}
