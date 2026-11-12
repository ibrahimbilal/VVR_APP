import { AudioLines, ImagePlay, ListVideo, MonitorPlay } from '@lucide/vue'
import type { Component } from 'vue'
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

const APP_ICONS: Record<RenderAppId, Component> = {
  ranking: ListVideo,
  screensaver: MonitorPlay,
  'audio-looper': AudioLines,
  'image-motion': ImagePlay,
}

export function renderAppLabel(app: RenderAppId): string {
  return APP_LABELS[app]
}

export function renderAppIcon(app: RenderAppId): Component {
  return APP_ICONS[app]
}

export function notifyRenderReady(
  app: RenderAppId,
  projectName: string,
  downloadUrl: string,
  filename: string,
  trackId?: string,
  projectId?: string | null,
): void {
  const platform = usePlatformStore()
  const name = projectName.trim() || 'Untitled project'
  const route = RENDER_APP_ROUTES[app]

  if (trackId && platform.promoteActiveRenderJobToReady(trackId, { downloadUrl, filename })) {
    return
  }

  platform.addRenderReadyNotification({
    app,
    projectName: name,
    route,
    downloadUrl,
    filename,
    projectId,
  })
}

/** Failed and cancelled Screensaver renders stay in the panel so Open can restore that project. */
export function notifyRenderOutcome(
  app: RenderAppId,
  projectName: string,
  outcome: 'failed' | 'cancelled',
  trackId: string,
  projectId?: string | null,
  error?: string | null,
): void {
  if (app !== 'screensaver' || !projectId) return
  const platform = usePlatformStore()
  platform.addRenderOutcomeNotification({
    id: trackId,
    app,
    projectName,
    route: RENDER_APP_ROUTES[app],
    projectId,
    outcome,
    error,
  })
}
