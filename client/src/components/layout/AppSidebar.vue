<script setup lang="ts">
import { ChevronLeft, ChevronRight, Film } from '@lucide/vue'
import { RouterLink, useRoute } from 'vue-router'
import { navItems } from '../../app/navigation'
import { usePlatformStore } from '../../stores/platform'

const route = useRoute()
const platform = usePlatformStore()

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <aside
    class="hidden h-full shrink-0 flex-col border-r border-zinc-800 bg-[#0c0d10] transition-[width] duration-200 ease-out xl:flex"
    :class="platform.sidebarCollapsed ? 'w-14' : 'w-[240px]'"
  >
    <div class="flex h-14 items-center gap-2 border-b border-zinc-800 px-3">
      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-amber-300 text-black">
        <Film :size="16" />
      </span>
      <span v-if="!platform.sidebarCollapsed" class="min-w-0 truncate text-sm font-black tracking-[0.06em]">Video's Factory</span>
    </div>
    <nav class="flex flex-1 flex-col gap-1 p-2" aria-label="Main">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors"
        :class="
          isActive(item.path)
            ? 'bg-amber-300/15 text-amber-300'
            : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100'
        "
        :title="platform.sidebarCollapsed ? item.label : undefined"
      >
        <component :is="item.icon" class="shrink-0" :size="18" />
        <span v-if="!platform.sidebarCollapsed">{{ item.label }}</span>
      </RouterLink>
    </nav>
    <button
      class="m-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-800 py-2 text-xs text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
      type="button"
      :aria-label="platform.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      @click="platform.toggleSidebarCollapsed()"
    >
      <ChevronRight v-if="platform.sidebarCollapsed" :size="16" />
      <template v-else>
        <ChevronLeft :size="16" />
        <span>Collapse</span>
      </template>
    </button>
  </aside>
</template>
