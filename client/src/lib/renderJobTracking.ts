import { RENDER_APP_ROUTES, type RenderAppId } from './renderNotifications'
import { usePlatformStore } from '../stores/platform'
import type { ExportState } from '../types'

export function beginTrackedRender(app: RenderAppId, projectName: string): string {
  const id = crypto.randomUUID()
  const platform = usePlatformStore()
  platform.addActiveRenderJob({
    id,
    app,
    projectName,
    route: RENDER_APP_ROUTES[app],
    progress: 0,
    message: 'Starting export…',
    stage: null,
  })
  return id
}

export function syncTrackedRender(trackId: string, state: ExportState): void {
  const platform = usePlatformStore()
  if (!platform.activeRenderJobs.some((item) => item.id === trackId)) return
  platform.updateActiveRenderJob(trackId, {
    progress: state.progress,
    message: state.stage || state.message || 'Rendering…',
    stage: state.stage ?? null,
  })
}

export function endTrackedRender(trackId: string): void {
  usePlatformStore().removeActiveRenderJob(trackId)
}
