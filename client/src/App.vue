<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { X } from '@lucide/vue'
import AppHeader from './components/layout/AppHeader.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import MobileNavDrawer from './components/layout/MobileNavDrawer.vue'
import { resumePersistedRenderJobs } from './lib/resumePersistedRenderJobs'
import { usePlatformStore } from './stores/platform'

const platform = usePlatformStore()
const navTrigger = ref<HTMLElement | null>(null)

onMounted(() => {
  void platform.refreshServer().then(() => resumePersistedRenderJobs())
})

function onOpenNav(trigger: HTMLElement) {
  navTrigger.value = trigger
  platform.openMobileNav()
}

function onCloseNav() {
  platform.closeMobileNav()
  navTrigger.value = null
}
</script>

<template>
  <div class="flex h-[100dvh] overflow-hidden bg-app text-zinc-100">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader @open-nav="onOpenNav" />
      <main class="min-h-0 flex-1 overflow-hidden">
        <RouterView />
      </main>
    </div>
    <MobileNavDrawer :open="platform.mobileNavOpen" :trigger="navTrigger" @close="onCloseNav" />
    <div class="pointer-events-none fixed bottom-6 right-4 z-40 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2">
      <div
        v-for="item in platform.toasts"
        :key="item.id"
        class="toast"
        :class="item.tone === 'error' ? 'toast-error' : item.tone === 'success' ? 'toast-success' : undefined"
      >
        <div class="flex items-start gap-3">
          <p class="flex-1">{{ item.text }}</p>
          <button class="cursor-pointer text-zinc-400" type="button" aria-label="Dismiss" @click="platform.dismissToast(item.id)">
            <X :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
