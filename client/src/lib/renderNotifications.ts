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

let permissionRequested = false

export function renderAppLabel(app: RenderAppId): string {
  return APP_LABELS[app]
}

/** Ask once per session when the user starts a render (non-blocking). */
export function ensureRenderNotificationPermission(): void {
  if (permissionRequested || typeof Notification === 'undefined') return
  permissionRequested = true
  if (Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

export function notifyRenderReady(
  app: RenderAppId,
  projectName: string,
  downloadUrl: string,
  filename: string,
  onNavigate?: (path: string) => void,
): void {
  const platform = usePlatformStore()
  const label = APP_LABELS[app]
  const name = projectName.trim() || 'Untitled project'
  const route = RENDER_APP_ROUTES[app]

  platform.addRenderReadyNotification({
    app,
    projectName: name,
    route,
    downloadUrl,
    filename,
  })

  const body = `${name} is rendered and ready to download.`

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const notification = new Notification(`${label} — ready to download`, {
        body,
        icon: '/favicon.svg',
        tag: `vvr-render-${app}`,
      })
      notification.onclick = () => {
        window.focus()
        if (onNavigate) onNavigate(route)
        else window.location.assign(route)
        notification.close()
      }
    } catch {
      // in-app notification already recorded
    }
  }
}
