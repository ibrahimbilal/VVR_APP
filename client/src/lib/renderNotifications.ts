import { usePlatformStore } from '../stores/platform'

export type RenderAppId = 'ranking' | 'screensaver'

const APP_LABELS: Record<RenderAppId, string> = {
  ranking: 'Ranking Videos',
  screensaver: 'Frame Screensaver',
}

export const RENDER_APP_ROUTES: Record<RenderAppId, string> = {
  ranking: '/ranking-videos',
  screensaver: '/frame-screensaver',
}

export function renderAppLabel(app: RenderAppId): string {
  return APP_LABELS[app]
}

export function notifyRenderReady(
  app: RenderAppId,
  projectName: string,
  downloadUrl: string,
  filename: string,
): void {
  const platform = usePlatformStore()
  const name = projectName.trim() || 'Untitled project'
  const route = RENDER_APP_ROUTES[app]

  platform.addRenderReadyNotification({
    app,
    projectName: name,
    route,
    downloadUrl,
    filename,
  })
}
