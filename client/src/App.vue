<script setup lang="ts">
import { CircleAlert, CircleCheck, FilePlus, ListVideo, MonitorPlay, SlidersHorizontal, X, Film } from '@lucide/vue'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import ClipSidebar from './components/ClipSidebar.vue'
import PreviewStage from './components/PreviewStage.vue'
import SelectedClipPanel from './components/SelectedClipPanel.vue'
import StylePanel from './components/StylePanel.vue'
import TimelineBar from './components/TimelineBar.vue'
import { usePlayback } from './composables/usePlayback'
import { useProjectStore } from './stores/project'

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
  <div class="relative flex h-[100dvh] flex-col overflow-hidden bg-[#101114] text-zinc-100">
    <header class="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
      <div class="flex items-center gap-2">
        <span class="grid h-7 w-7 place-items-center rounded-sm bg-amber-300 text-[10px] font-black text-black"><Film /></span>
        <span class="text-sm font-black tracking-[0.16em]">Vertical Video Ranking</span>
      </div>
      <button class="btn cursor-pointer btn-ghost" type="button" @click="store.newProject">
        <FilePlus :size="16" />
        New project
      </button>
      <button class="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-semibold" type="button" aria-label="Refresh renderer status" @click="store.refreshServer">
        <CircleCheck v-if="store.serverOnline" class="text-emerald-400" :size="16" />
        <CircleAlert v-else class="text-red-300" :size="16" />
        <span :class="store.serverOnline ? 'text-emerald-400' : 'text-red-300'">
          {{ store.serverOnline ? 'Renderer ready' : 'Renderer offline' }}
        </span>
      </button>
    </header>

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

    <div
      class="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1"
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

    <TimelineBar class="shrink-0" />

    <div v-if="!store.hydrated" class="absolute inset-0 z-30 grid place-items-center bg-[#101114]/90 text-sm text-zinc-300">
      Restoring saved project…
    </div>
    <div class="pointer-events-none absolute bottom-28 right-4 z-20 flex w-80 flex-col gap-2">
      <div
        v-for="item in store.toasts"
        :key="item.id"
        class="pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg"
        :class="item.tone === 'error' ? 'border-red-900 bg-[#2a1515] text-red-100' : 'border-zinc-700 bg-[#1c1f26] text-zinc-100'"
      >
        <div class="flex items-start gap-3">
          <p class="flex-1">{{ item.text }}</p>
          <button class="cursor-pointer text-zinc-400" type="button" aria-label="Dismiss" title="Dismiss" @click="store.dismissToast(item.id)">
            <X :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
