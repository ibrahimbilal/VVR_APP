<script setup lang="ts">
import { CircleX, Download } from '@lucide/vue'
import { computed } from 'vue'
import { formatBytes } from '../../../lib/format'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()

const mode = computed(() => {
  if (store.exporting) return 'busy'
  if (store.exportState.phase === 'done' && store.exportState.downloadUrl) return 'download'
  return 'export'
})

const progress = computed(() => Math.min(100, Math.max(0, Math.round(store.exportState.progress * 100))))

const busyLabel = computed(() => {
  const phase = store.exportState.phase
  if (phase === 'uploading') return 'Uploading'
  if (phase === 'queued') return 'Queued'
  if (phase === 'preparing') return 'Preparing'
  if (phase === 'rendering') return `Rendering ${progress.value}%`
  if (phase === 'verifying') return 'Verifying'
  return 'Exporting'
})

function formatSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function onClick() {
  if (mode.value === 'busy') {
    store.cancelExport()
    return
  }
  if (mode.value === 'download') {
    store.downloadExport()
    return
  }
  void store.startExport()
}
</script>

<template>
  <button
    class="export-action btn w-full"
    :class="{
      'export-action--export btn-primary': mode === 'export',
      'export-action--busy': mode === 'busy',
      'export-action--download btn-success': mode === 'download',
    }"
    type="button"
    :disabled="mode === 'export' && Boolean(store.exportBlocker)"
    :style="mode === 'busy' ? { '--progress': `${progress}%` } : undefined"
    @click="onClick"
  >
    <span class="export-action__layer export-action__layer--default flex items-center gap-1">
      <template v-if="mode === 'export'">Export MP4</template>
      <template v-else-if="mode === 'busy'">{{ busyLabel }}</template>
      <template v-else>
        <Download :size="16" />
        {{ store.exportState.bytes ? `Download ${formatBytes(store.exportState.bytes)}` : 'Download MP4' }}
      </template>
    </span>
    <span v-if="mode === 'busy'" class="export-action__layer export-action__layer--hover">
      <CircleX :size="16" />
      Cancel export
    </span>
  </button>
  <p v-if="store.exportBlocker && mode === 'export'" class="mt-2 text-xs text-zinc-500">{{ store.exportBlocker }}</p>
  <p v-if="store.exportState.error" class="mt-2 text-xs text-red-300">{{ store.exportState.error }}</p>
  <button
    v-if="store.exportState.error && store.encoder !== 'cpu' && store.encoder !== 'auto'"
    class="btn btn-ghost mt-2 cursor-pointer"
    type="button"
    @click="store.exportWithCpu()"
  >
    Export with CPU instead
  </button>
  <dl v-if="store.exporting || store.exportState.encoder" class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-400">
    <div>Stage</div>
    <div class="text-zinc-200">{{ store.exportState.stage || store.exportState.message || '—' }}</div>
    <div>Encoding</div>
    <div class="text-zinc-200">{{ store.exportState.encoder || '—' }}</div>
    <div>Acceleration</div>
    <div class="text-zinc-200">{{ store.exportState.hardware == null ? '—' : store.exportState.hardware ? 'Active' : 'Off' }}</div>
    <div>Speed</div>
    <div class="text-zinc-200">{{ store.exportState.encodeSpeed != null ? `${store.exportState.encodeSpeed.toFixed(2)}x realtime` : '—' }}</div>
    <div>Encode fps</div>
    <div class="text-zinc-200">{{ store.exportState.encodeFps != null ? store.exportState.encodeFps.toFixed(1) : '—' }}</div>
    <div>Elapsed</div>
    <div class="text-zinc-200">{{ formatSeconds(store.exportState.elapsedSec) }}</div>
    <div>Remaining</div>
    <div class="text-zinc-200">{{ store.exportState.etaSec == null ? 'Estimating…' : formatSeconds(store.exportState.etaSec) }}</div>
    <div>Output</div>
    <div class="text-zinc-200">{{ store.outputWidth }}×{{ store.outputHeight }} · {{ store.fps }} fps · {{ store.durationLabel }}</div>
  </dl>
</template>

<style scoped>
.export-action {
  position: relative;
  overflow: hidden;
}
.export-action--busy::before {
  content: '';
  position: absolute;
  inset: 0;
  width: var(--progress, 0%);
  background: rgba(255, 204, 51, 0.25);
  pointer-events: none;
}
.export-action__layer--hover {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background: #2a1515;
  color: #fecaca;
}
.export-action--busy:hover .export-action__layer--default {
  visibility: hidden;
}
.export-action--busy:hover .export-action__layer--hover {
  display: inline-flex;
}
</style>
