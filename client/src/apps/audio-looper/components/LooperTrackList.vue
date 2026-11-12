<script setup lang="ts">
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from '@lucide/vue'
import { ref } from 'vue'
import { useCardReorder } from '../../../composables/useCardReorder'
import { formatClock } from '../../../lib/format'
import { useAudioLooperStore } from '../stores/audioLooper'

const store = useAudioLooperStore()
const listEl = ref<HTMLElement | null>(null)
const { instant, itemStyle, isPlaceholder, onGripPointerDown } = useCardReorder({
  list: listEl,
  onReorder: (from, to) => store.reorder(from, to),
})
</script>

<template>
  <div ref="listEl" class="space-y-2" :class="{ 'card-reorder-instant': instant }">
    <article
      v-for="(track, index) in store.playbackTracks"
      :key="track.id"
      data-reorder-item
      class="card-reorder-item cursor-pointer rounded-lg border bg-inset p-2"
      :class="[
        store.selectedTrackId === track.id ? 'border-zinc-200' : 'border-zinc-800',
        store.sequenceTrackId === track.id && !isPlaceholder(index) ? 'ring-1 ring-brand/70' : '',
        isPlaceholder(index) ? 'card-reorder-placeholder' : '',
      ]"
      :style="itemStyle(index)"
      @click="store.selectTrack(track.id)"
    >
      <div class="flex gap-2">
        <button
          v-if="store.trackCount > 1"
          class="mt-0.5 w-5 shrink-0 cursor-grab touch-none select-none text-zinc-500"
          type="button"
          aria-label="Drag to reorder"
          @pointerdown.stop="onGripPointerDown($event, index)"
        >
          <GripVertical :size="16" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-zinc-100" :title="store.displayName(track)">
            {{ store.displayName(track) }}
          </p>
          <p class="mt-0.5 text-xs text-zinc-500">
            <template v-if="track.status === 'reading'">Reading audio…</template>
            <template v-else-if="track.status === 'error'">{{ track.error }}</template>
            <template v-else>{{ store.metaLabel(track) }}</template>
          </p>
          <p v-if="store.sequenceTrackId === track.id" class="mt-0.5 text-xs text-brand">Playing</p>
        </div>
        <span v-if="track.duration" class="shrink-0 text-xs tabular-nums text-zinc-400">{{ formatClock(store.trimmedLength(track)) }}</span>
      </div>
      <div v-if="store.trackCount > 1" class="mt-2 flex">
        <button class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Move up" title="Move up" :disabled="index === 0" @click.stop="store.reorder(index, index - 1)">
          <ChevronUp :size="16" />
        </button>
        <button class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Move down" title="Move down" :disabled="index === store.playbackTracks.length - 1" @click.stop="store.reorder(index, index + 1)">
          <ChevronDown :size="16" />
        </button>
        <button class="ml-auto rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-red-300 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" type="button" aria-label="Remove track" title="Remove track" @click.stop="store.removeTrack(track.id)">
          <Trash2 :size="16" />
        </button>
      </div>
      <div v-else class="mt-2 flex justify-end">
        <button class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-red-300 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" type="button" aria-label="Remove audio" title="Remove audio" @click.stop="store.removeTrack(track.id)">
          <Trash2 :size="16" />
        </button>
      </div>
    </article>
  </div>
</template>
