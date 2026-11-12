import type { ScreensaverRenderEvent } from './screensaverProjectModel'

type OpenListener = (projectId: string) => void
type RenderListener = (event: ScreensaverRenderEvent) => void

let pendingProjectId: string | null = null
let projectsReady = false
const openListeners = new Set<OpenListener>()
const renderListeners = new Set<RenderListener>()
const latestRender = new Map<string, ScreensaverRenderEvent>()

export function requestOpenScreensaverProject(projectId: string): void {
  pendingProjectId = projectId
  if (!projectsReady) return
  for (const listener of openListeners) listener(projectId)
}

export function takePendingScreensaverProject(): string | null {
  const id = pendingProjectId
  pendingProjectId = null
  return id
}

export function consumePendingScreensaverProject(id: string): void {
  if (pendingProjectId === id) pendingProjectId = null
}

export function markScreensaverProjectsReady(): void {
  projectsReady = true
}

export function onScreensaverProjectOpen(listener: OpenListener): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

export function publishScreensaverRender(event: ScreensaverRenderEvent): void {
  latestRender.set(event.projectId, event)
  if (!projectsReady) return
  for (const listener of renderListeners) listener(event)
}

export function peekScreensaverRenderEvents(): ScreensaverRenderEvent[] {
  return [...latestRender.values()]
}

export function onScreensaverRender(listener: RenderListener): () => void {
  renderListeners.add(listener)
  return () => renderListeners.delete(listener)
}
