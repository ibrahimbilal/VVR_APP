<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()
const open = ref(true)

const visible = computed(
  () => store.exporting || Boolean(store.exportState.encoder) || store.exportState.phase === 'done',
)

watch(
  () => store.exporting,
  (busy) => {
    if (busy) open.value = true
  },
)

function formatSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
</script>

<template>
  <aside
    v-if="visible"
    class="hidden h-full min-h-0 shrink-0 flex-col border-zinc-800 bg-[#0c0d10] transition-[width] duration-200 ease-out xl:flex xl:border-l"
    :class="open ? 'w-[320px]' : 'w-14'"
  >
    <div v-show="open" class="min-h-0 flex-1 overflow-y-auto p-4">
      <h2 class="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Export status</h2>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-zinc-400">
        <div>Stage</div>
        <div class="text-zinc-200">{{ store.exportState.stage || store.exportState.message || '—' }}</div>
        <div>Encoding</div>
        <div class="text-zinc-200">{{ store.exportState.encoder || '—' }}</div>
        <div>Acceleration</div>
        <div class="text-zinc-200">
          {{ store.exportState.hardware == null ? '—' : store.exportState.hardware ? 'Active' : 'Off' }}
        </div>
        <div>Speed</div>
        <div class="text-zinc-200">
          {{ store.exportState.encodeSpeed != null ? `${store.exportState.encodeSpeed.toFixed(2)}x realtime` : '—' }}
        </div>
        <div>Encode fps</div>
        <div class="text-zinc-200">
          {{ store.exportState.encodeFps != null ? store.exportState.encodeFps.toFixed(1) : '—' }}
        </div>
        <div>Elapsed</div>
        <div class="text-zinc-200">{{ formatSeconds(store.exportState.elapsedSec) }}</div>
        <div>Remaining</div>
        <div class="text-zinc-200">
          {{ store.exportState.etaSec == null ? 'Estimating…' : formatSeconds(store.exportState.etaSec) }}
        </div>
        <div>Output</div>
        <div class="text-zinc-200">{{ store.style.video.width }}×{{ store.style.video.height }} · {{ store.style.video.fps }} fps</div>
      </dl>
    </div>
    <div v-if="!open" class="min-h-0 flex-1" aria-hidden="true" />
    <button
      class="m-2 flex flex-row-reverse shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-800 py-2 text-xs text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
      type="button"
      :aria-label="open ? 'Collapse sidebar' : 'Expand sidebar'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <ChevronLeft v-if="!open" :size="16" />
      <template v-else>
        <ChevronRight :size="16" />
        <span>Collapse</span>
      </template>
    </button>
  </aside>
</template>
