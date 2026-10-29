import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../lib/api'
import type { RenderAppId } from '../lib/renderNotifications'

export type RenderReadyNotification = {
  id: string
  app: RenderAppId
  projectName: string
  route: string
  downloadUrl: string
  filename: string
  createdAt: number
  read: boolean
}

export type ActiveRenderJob = {
  id: string
  app: RenderAppId
  projectName: string
  route: string
  progress: number
  message: string
  stage: string | null
}

const MAX_RENDER_NOTIFICATIONS = 30

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

const SIDEBAR_KEY = 'vf-sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export const usePlatformStore = defineStore('platform', () => {
  const serverOnline = ref(false)
  const toasts = ref<{ id: string; text: string; tone: 'info' | 'error' | 'success' }[]>([])
  const sidebarCollapsed = ref(readCollapsed())
  const mobileNavOpen = ref(false)
  const renderNotifications = ref<RenderReadyNotification[]>([])
  const activeRenderJobs = ref<ActiveRenderJob[]>([])

  const unreadNotificationCount = computed(() => renderNotifications.value.filter((item) => !item.read).length)

  const notificationOperationCount = computed(
    () => activeRenderJobs.value.length + renderNotifications.value.length,
  )

  /** Combined progress across in-progress renders (partial) and ready items (100%). */
  const notificationRingProgress = computed(() => {
    const jobs = activeRenderJobs.value
    const ready = renderNotifications.value
    const total = jobs.length + ready.length
    if (total === 0) return 0
    const jobSum = jobs.reduce((sum, job) => sum + clampProgress(job.progress), 0)
    return (jobSum + ready.length) / total
  })

  function addActiveRenderJob(input: Omit<ActiveRenderJob, 'progress' | 'message' | 'stage'> & Partial<Pick<ActiveRenderJob, 'progress' | 'message' | 'stage'>>): void {
    const entry: ActiveRenderJob = {
      id: input.id,
      app: input.app,
      projectName: input.projectName.trim() || 'Untitled project',
      route: input.route,
      progress: clampProgress(input.progress ?? 0),
      message: input.message ?? 'Starting export…',
      stage: input.stage ?? null,
    }
    activeRenderJobs.value = [...activeRenderJobs.value.filter((item) => item.id !== entry.id), entry]
  }

  function updateActiveRenderJob(id: string, patch: Partial<Pick<ActiveRenderJob, 'progress' | 'message' | 'stage'>>): void {
    activeRenderJobs.value = activeRenderJobs.value.map((item) =>
      item.id === id
        ? {
            ...item,
            progress: patch.progress != null ? clampProgress(patch.progress) : item.progress,
            message: patch.message ?? item.message,
            stage: patch.stage !== undefined ? patch.stage : item.stage,
          }
        : item,
    )
  }

  function removeActiveRenderJob(id: string): void {
    activeRenderJobs.value = activeRenderJobs.value.filter((item) => item.id !== id)
  }

  function addRenderReadyNotification(input: {
    app: RenderAppId
    projectName: string
    route: string
    downloadUrl: string
    filename: string
  }): void {
    const entry: RenderReadyNotification = {
      id: crypto.randomUUID(),
      app: input.app,
      projectName: input.projectName.trim() || 'Untitled project',
      route: input.route,
      downloadUrl: input.downloadUrl,
      filename: input.filename,
      createdAt: Date.now(),
      read: false,
    }
    renderNotifications.value = [entry, ...renderNotifications.value].slice(0, MAX_RENDER_NOTIFICATIONS)
  }

  function markAllNotificationsRead(): void {
    renderNotifications.value = renderNotifications.value.map((item) => ({ ...item, read: true }))
  }

  function dismissNotification(id: string): void {
    renderNotifications.value = renderNotifications.value.filter((item) => item.id !== id)
  }

  function clearRenderQueues(): void {
    activeRenderJobs.value = []
    renderNotifications.value = []
  }

  function toast(text: string, tone: 'info' | 'error' | 'success' = 'error') {
    const id = crypto.randomUUID()
    toasts.value = [...toasts.value.slice(-3), { id, text, tone }]
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((item) => item.id !== id)
    }, 5200)
  }

  function dismissToast(id: string) {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  function setSidebarCollapsed(value: boolean) {
    sidebarCollapsed.value = value
    try {
      localStorage.setItem(SIDEBAR_KEY, value ? '1' : '0')
    } catch {
      // ignore
    }
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(!sidebarCollapsed.value)
  }

  function openMobileNav() {
    mobileNavOpen.value = true
  }

  function closeMobileNav() {
    mobileNavOpen.value = false
  }

  async function refreshServer() {
    serverOnline.value = await api.health()
  }

  return {
    serverOnline,
    toasts,
    sidebarCollapsed,
    mobileNavOpen,
    renderNotifications,
    activeRenderJobs,
    unreadNotificationCount,
    notificationOperationCount,
    notificationRingProgress,
    addActiveRenderJob,
    updateActiveRenderJob,
    removeActiveRenderJob,
    addRenderReadyNotification,
    markAllNotificationsRead,
    dismissNotification,
    clearRenderQueues,
    toast,
    dismissToast,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    openMobileNav,
    closeMobileNav,
    refreshServer,
  }
})
