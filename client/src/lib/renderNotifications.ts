import { usePlatformStore } from '../stores/platform'

export type RenderAppId = 'ranking' | 'screensaver' | 'audio-looper' | 'image-motion'

const APP_LABELS: Record<RenderAppId, string> = {
  ranking: 'Shorts',
  screensaver: 'Screensaver',
  'audio-looper': 'Audio Looper',
  'image-motion': 'Image Motion Shorts',
}

export const RENDER_APP_ROUTES: Record<RenderAppId, string> = {
  ranking: '/shorts',
  screensaver: '/screensaver',
  'audio-looper': '/looper',
  'image-motion': '/shorts',
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
