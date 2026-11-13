<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { RouterLink, useRoute } from 'vue-router'
import { navItems } from '../../app/navigation'
import { usePlatformStore } from '../../stores/platform'
import AppVersionLabel from './AppVersionLabel.vue'

const route = useRoute()
const platform = usePlatformStore()

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function railLabel(label: string): string {
  if (label === 'Dashboard') return 'Home'
  if (label === 'Image Upscaler') return 'Upscale'
  if (label === 'Audio Looper') return 'Looper'
  return label
}
</script>

<template>
  <aside
    class="studio-shell hidden h-full shrink-0 flex-col border-r border-white/5 transition-[width] duration-200 ease-out xl:flex"
    :class="platform.sidebarCollapsed ? 'w-16' : 'w-[5.5rem]'"
  >
    <div class="flex h-16 items-center justify-center">
      <RouterLink
        :to="{ name: 'dashboard' }"
        class="focus-ring grid h-11 w-11 place-items-center rounded-2xl bg-elevated"
        aria-label="Ribo Studio, go to dashboard"
        title="Dashboard"
      >
        <img src="/logo.png" alt="" class="h-7 w-7 object-contain" />
      </RouterLink>
    </div>
    <nav class="flex flex-1 flex-col gap-1 px-2" aria-label="Main">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-link focus-ring flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold leading-none"
        :class="
          isActive(item.path)
            ? 'nav-link--active bg-brand text-white'
            : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-100'
        "
        :aria-current="isActive(item.path) ? 'page' : undefined"
        :aria-label="item.label"
        :title="item.label"
      >
        <component :is="item.icon" class="shrink-0" :size="18" />
        <span v-if="!platform.sidebarCollapsed" class="max-w-full truncate">{{ railLabel(item.label) }}</span>
      </RouterLink>
    </nav>
    <AppVersionLabel compact class="mx-1 mb-1" />
    <button
      class="focus-ring mx-2 mb-3 flex cursor-pointer items-center justify-center rounded-xl py-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
      type="button"
      :aria-label="platform.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      @click="platform.toggleSidebarCollapsed()"
    >
      <ChevronRight v-if="platform.sidebarCollapsed" :size="16" />
      <ChevronLeft v-else :size="16" />
    </button>
  </aside>
</template>
