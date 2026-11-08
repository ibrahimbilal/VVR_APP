<script setup lang="ts">
import { ListVideo, MonitorPlay, SlidersHorizontal } from '@lucide/vue'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import AppMobileTabs from '../../components/ui/AppMobileTabs.vue'
import AppSettingsTabs from '../../components/ui/AppSettingsTabs.vue'
import AppStudioExportBar from '../../components/ui/AppStudioExportBar.vue'
import ClipSidebar from '../../components/ClipSidebar.vue'
import ExportActionButton from '../../components/ExportActionButton.vue'
import PreviewStage from '../../components/PreviewStage.vue'
import SelectedClipPanel from '../../components/SelectedClipPanel.vue'
import StylePanel from '../../components/StylePanel.vue'
import RankingExportDetails from '../../components/RankingExportDetails.vue'
import { usePlayback } from '../../composables/usePlayback'
import { formatClock } from '../../lib/format'
import { useProjectStore } from '../../stores/project'

const store = useProjectStore()
const playback = usePlayback()
const tab = ref<'clips' | 'preview' | 'edit'>('preview')
const inspector = ref<'clip' | 'look' | 'output' | 'sound'>('look')
const tabs = [
  { id: 'clips' as const, label: 'Clips', icon: ListVideo },
  { id: 'preview' as const, label: 'Preview', icon: MonitorPlay },
  { id: 'edit' as const, label: 'Edit', icon: SlidersHorizontal },
]
const inspectorTabs = [
  { id: 'clip' as const, label: 'Clip' },
  { id: 'look' as const, label: 'Style' },
  { id: 'sound' as const, label: 'Sound' },
  { id: 'output' as const, label: 'Output' },
]

function styleFocus(): 'look' | 'sound' | 'output' {
  if (inspector.value === 'sound') return 'sound'
  if (inspector.value === 'output') return 'output'
  return 'look'
}

const exportStatus = computed(() => {
  if (store.exporting) {
    const queue = store.activeExportCount > 1 ? ` · ${store.activeExportCount} in queue` : ''
    return `${store.exportState.message}${queue}`
  }
  if (store.exportState.phase === 'error') return store.exportState.error ?? 'Export failed.'
  if (store.exportState.phase === 'done') {
    const warning = store.exportState.warning ? `. ${store.exportState.warning}` : '.'
    return `Export ready${warning} Tap download when you are ready.`
  }
  if (store.exportBlocker) return store.exportBlocker
  return `${store.clips.length} clips · ${formatClock(playback.duration.value)}`
})

function onKeyDown(event: KeyboardEvent) {
  if (event.code !== 'Space') return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
  event.preventDefault()
  playback.toggle()
}

onMounted(() => {
  void store.init()
  window.addEventListener('keydown', onKeyDown)
  if (import.meta.env.DEV) {
    ;(window as unknown as { __vvr?: typeof store }).__vvr = store
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 text-zinc-100">
    <AppMobileTabs v-model="tab" :items="tabs" hide-from="xl" />

    <div class="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden">
      <div
        class="grid min-h-0 min-w-0 flex-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)_360px]"
      >
        <div class="studio-panel min-h-0 overflow-hidden xl:flex" :class="tab === 'clips' ? 'flex' : 'hidden'">
          <ClipSidebar class="h-full w-full" />
        </div>

        <div
          class="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden"
          :class="tab === 'preview' ? 'flex' : 'hidden xl:flex'"
        >
          <div class="studio-stage flex min-h-0 min-w-0 flex-1 basis-0 overflow-hidden">
            <PreviewStage class="h-full w-full" />
          </div>
          <AppStudioExportBar :status="exportStatus" :error="store.exportState.phase === 'error'">
            <ExportActionButton />
          </AppStudioExportBar>
        </div>

        <div class="studio-panel flex min-h-0 flex-col overflow-hidden xl:flex" :class="tab === 'edit' ? 'flex' : 'hidden'">
          <div class="shrink-0 border-b border-zinc-800">
            <h2 class="px-4 pt-4 text-sm font-bold text-zinc-100">Settings</h2>
            <AppSettingsTabs v-model="inspector" :items="inspectorTabs" :cols="4" />
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <Transition name="settings-pane" mode="out-in">
              <div v-if="inspector === 'clip'" key="clip" class="h-full w-full">
                <SelectedClipPanel class="h-full w-full" />
                <p v-if="!store.selectedClip" class="px-4 pb-4 mt-3 text-xs text-zinc-500">Select a clip to trim it, recolor it, or play it last.</p>
              </div>
              <StylePanel
                v-else
                :key="inspector"
                class="h-full w-full"
                :focus="styleFocus()"
              />
            </Transition>
          </div>
        </div>
      </div>
      <div class="hidden xl:contents">
        <RankingExportDetails />
      </div>
    </div>

    <div v-if="!store.hydrated" class="scrim">
      Restoring saved project…
    </div>
  </div>
</template>
