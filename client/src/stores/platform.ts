import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../lib/api'

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
  const toasts = ref<{ id: string; text: string; tone: 'info' | 'error' }[]>([])
  const sidebarCollapsed = ref(readCollapsed())
  const mobileNavOpen = ref(false)

  function toast(text: string, tone: 'info' | 'error' = 'error') {
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
    toast,
    dismissToast,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    openMobileNav,
    closeMobileNav,
    refreshServer,
  }
})
