<script setup lang="ts">
import { CircleAlert, CircleCheck, FilePlus, Menu } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useScreensaverStore } from '../../apps/frame-screensaver/stores/screensaver'
import { useThumbnailStore } from '../../apps/thumbnail-studio/stores/thumbnail'
import { usePlatformStore } from '../../stores/platform'
import { useProjectStore } from '../../stores/project'

const route = useRoute()
const platform = usePlatformStore()
const project = useProjectStore()
const screensaver = useScreensaverStore()
const thumbnail = useThumbnailStore()

const title = computed(() => (route.meta.title as string) || "Video's Factory")
const showNewProject = computed(() =>
  route.name === 'ranking-videos' || route.name === 'frame-screensaver' || route.name === 'thumbnail-studio',
)

function startNewProject(): void {
  if (route.name === 'ranking-videos') void project.newProject()
  else if (route.name === 'frame-screensaver') void screensaver.newProject()
  else if (route.name === 'thumbnail-studio') void thumbnail.newProject()
}

const emit = defineEmits<{ openNav: [trigger: HTMLElement] }>()
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 bg-[#101114] px-4">
    <button
      class="btn btn-ghost cursor-pointer xl:hidden"
      type="button"
      aria-label="Open navigation menu"
      @click="emit('openNav', $event.currentTarget as HTMLElement)"
    >
      <Menu :size="20" />
    </button>
    <h1 class="min-w-0 truncate text-sm font-semibold text-zinc-200">{{ title }}</h1>
    <button
      v-if="showNewProject"
      class="btn btn-ghost shrink-0 cursor-pointer"
      type="button"
      @click="startNewProject()"
    >
      <FilePlus :size="16" />
      <span class="hidden sm:inline">New project</span>
    </button>
    <button
      class="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-semibold"
      type="button"
      aria-label="Refresh renderer status"
      @click="platform.refreshServer()"
    >
      <CircleCheck v-if="platform.serverOnline" class="text-emerald-400" :size="16" />
      <CircleAlert v-else class="text-red-300" :size="16" />
      <span :class="platform.serverOnline ? 'text-emerald-400' : 'text-red-300'">
        {{ platform.serverOnline ? 'Renderer ready' : 'Renderer offline' }}
      </span>
    </button>
  </header>
</template>
