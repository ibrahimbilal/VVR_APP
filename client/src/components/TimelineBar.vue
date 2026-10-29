<script setup lang="ts">
import { computed } from 'vue'
import ExportActionButton from './ExportActionButton.vue'
import { usePlayback } from '../composables/usePlayback'
import { formatClock } from '../lib/format'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()
const playback = usePlayback()

const blocks = computed(() => {
  const list = playback.segments.value
  const total = playback.duration.value || 1
  const fade = list.length > 1 && list[1] ? Math.max(0, list[0]!.duration - list[1].start) : 0
  return list.map((segment, index) => {
    const visual = segment.duration - (index < list.length - 1 ? fade : 0)
    return {
      id: segment.clip.id,
      index: segment.index,
      title: segment.clip.title,
      duration: segment.duration,
      left: (segment.start / total) * 100,
      width: (visual / total) * 100,
      selected: segment.clip.id === store.selectedClipId,
    }
  })
})

const playheadLeft = computed(() => {
  if (playback.duration.value <= 0) return 0
  return Math.min(100, (playback.playhead.value / playback.duration.value) * 100)
})

function onTimelineClick(event: MouseEvent) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement) || playback.duration.value <= 0) return
  const rect = target.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  void playback.seek(ratio * playback.duration.value)
}

function selectBlock(id: string, index: number) {
  store.selectClip(id)
  const segment = playback.segments.value.find((item) => item.index === index)
  if (segment) void playback.seek(segment.start)
}
</script>

<template>
  <footer class="border-t border-zinc-800 bg-[#121318] px-4 py-3">
    <div class="mb-3 flex flex-col xl:flex-row items-center justify-end gap-3">
      <div v-if="blocks.length > 0" class="relative h-10 w-full overflow-hidden rounded-md bg-zinc-900" @click="onTimelineClick">
        <button
          v-for="block in blocks"
          :key="block.id"
          class="absolute inset-y-1 flex cursor-pointer items-center overflow-hidden rounded px-2 text-left text-[11px]"
          :style="{
            left: `calc(${block.left}% + 2px)`,
            width: `calc(${Math.max(block.width, 0)}% - 4px)`,
            background: block.selected ? '#3f3718' : '#262a31',
          }"
          type="button"
          @click.stop="selectBlock(block.id, block.index)"
        >
          <span class="truncate text-zinc-100">{{ block.index + 1 }}. {{ block.title }}</span>
          <span class="ml-auto hidden shrink-0 pl-2 tabular-nums text-zinc-400 sm:inline">{{ formatClock(block.duration) }}</span>
        </button>
        <span class="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-300" :style="{ left: `${playheadLeft}%` }"></span>
      </div>
      <div class="w-44 shrink-0 sm:w-52">
        <ExportActionButton />
      </div>
    </div>
    <div class="flex items-center justify-between gap-3 text-xs text-zinc-400">
      <p class="truncate">
        <template v-if="store.exporting">
          {{ store.exportState.message }}
          <template v-if="store.activeExportCount > 1"> · {{ store.activeExportCount }} in queue</template>
        </template>
        <template v-else-if="store.exportState.phase === 'error'">{{ store.exportState.error }}</template>
        <template v-else-if="store.exportState.phase === 'done'">
          Export ready{{ store.exportState.warning ? `. ${store.exportState.warning}` : '.' }} Tap download when you are ready.
        </template>
        <template v-else-if="store.exportBlocker">{{ store.exportBlocker }}</template>
        <template v-else>{{ store.clips.length }} clips · {{ formatClock(playback.duration.value) }}</template>
      </p>
    </div>
  </footer>
</template>
