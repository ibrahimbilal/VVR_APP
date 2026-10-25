<script setup lang="ts">
import { ListVideo, MonitorPlay, SlidersHorizontal } from '@lucide/vue'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import ClipSidebar from '../../components/ClipSidebar.vue'
import PreviewStage from '../../components/PreviewStage.vue'
import SelectedClipPanel from '../../components/SelectedClipPanel.vue'
import StylePanel from '../../components/StylePanel.vue'
import RankingExportDetails from '../../components/RankingExportDetails.vue'
import TimelineBar from '../../components/TimelineBar.vue'
import { usePlayback } from '../../composables/usePlayback'
import { useProjectStore } from '../../stores/project'

const store = useProjectStore()
const playback = usePlayback()
const tab = ref<'clips' | 'preview' | 'style'>('preview')

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
  <div class="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#101114] text-zinc-100">
    <div class="flex gap-2 border-b border-zinc-800 p-2 xl:hidden">
      <button class="btn cursor-pointer flex-1" :class="tab === 'clips' ? 'btn-primary' : 'btn-ghost'" type="button" @click="tab = 'clips'">
        <ListVideo :size="16" />
        Clips
      </button>
      <button class="btn cursor-pointer flex-1" :class="tab === 'preview' ? 'btn-primary' : 'btn-ghost'" type="button" @click="tab = 'preview'">
        <MonitorPlay :size="16" />
        Preview
      </button>
      <button class="btn cursor-pointer flex-1" :class="tab === 'style' ? 'btn-primary' : 'btn-ghost'" type="button" @click="tab = 'style'">
        <SlidersHorizontal :size="16" />
        Style
      </button>
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        class="grid min-h-0 min-w-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1"
        :class="store.selectedPanelOpen && store.selectedClip ? 'xl:grid-cols-[350px_280px_minmax(0,1fr)_350px]' : 'xl:grid-cols-[350px_minmax(0,1fr)_350px]'"
      >
        <div class="min-h-0 xl:flex" :class="tab === 'clips' ? 'flex' : 'hidden'">
          <ClipSidebar class="h-full w-full" />
        </div>
        <div
          v-if="store.selectedPanelOpen && store.selectedClip"
          class="min-h-0 xl:flex"
          :class="tab === 'clips' ? 'flex' : 'hidden'"
        >
          <SelectedClipPanel class="h-full w-full" />
        </div>
        <div class="min-h-[70vh] xl:min-h-0 xl:flex" :class="tab === 'preview' ? 'flex' : 'hidden'">
          <PreviewStage class="h-full w-full" />
        </div>
        <div class="min-h-0 xl:flex" :class="tab === 'style' ? 'flex' : 'hidden'">
          <StylePanel class="h-full w-full" />
        </div>
      </div>
      <RankingExportDetails />
    </div>

    <TimelineBar class="shrink-0" />

    <div v-if="!store.hydrated" class="absolute inset-0 z-30 grid place-items-center bg-[#101114]/90 text-sm text-zinc-300">
      Restoring saved project…
    </div>
  </div>
</template>
