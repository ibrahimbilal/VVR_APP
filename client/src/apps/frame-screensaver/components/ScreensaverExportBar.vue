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
