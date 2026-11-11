<script setup lang="ts">
import { formatClock } from '../../../lib/format'
import { useImageMotionStore } from '../stores/imageMotion'

const store = useImageMotionStore()
</script>

<template>
  <div class="studio-panel hidden xl:flex min-h-0 shrink-0 flex-col gap-2 p-3">
    <div class="flex items-center justify-between text-xs text-zinc-500">
      <span class="section-label">Timeline</span>
      <span class="tabular-nums text-zinc-300">{{ formatClock(store.duration) }}</span>
    </div>
    <div class="flex gap-2 overflow-x-auto">
      <button
        v-for="(segment, index) in store.segments"
        :key="segment.id"
        type="button"
        class="flex flex-col cursor-pointer shrink-0 rounded-lg border bg-inset p-1 text-left"
        :class="store.selectedSegmentId === segment.id ? 'border-zinc-200' : 'border-zinc-800'"
        @click="store.selectSegment(segment.id)"
      >
        <div class="relative h-12 w-8 overflow-hidden rounded bg-zinc-900">
          <img v-if="store.objectUrlFor(segment.id)" :src="store.objectUrlFor(segment.id)!" alt="" class="h-full w-full object-cover" />
        </div>
        <p class="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
          <span class="font-semibold text-brand">{{ index + 1 }}</span>
          <span class="tabular-nums">{{ formatClock(segment.motion.duration) }}</span>
        </p>
        <p v-if="segment.transitionAfter.type === 'fade'" class="text-[10px] font-semibold text-brand">Fade</p>
      </button>
      <p v-if="store.segments.length === 0" class="py-2 text-sm text-zinc-500">Images appear here in playback order.</p>
    </div>
    <p v-if="store.musicName" class="truncate text-xs text-zinc-500">Audio · {{ store.musicName }}</p>
  </div>
</template>
