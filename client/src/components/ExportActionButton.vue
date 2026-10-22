<script setup lang="ts">
import { CircleX, Download } from '@lucide/vue'
import { computed } from 'vue'
import { formatBytes } from '../lib/format'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()

const mode = computed(() => {
  if (store.exporting) return 'busy'
  if (store.exportState.phase === 'done' && store.exportState.downloadUrl) return 'download'
  return 'export'
})

const progress = computed(() => Math.min(100, Math.max(0, Math.round(store.exportState.progress * 100))))

const busyLabel = computed(() => {
  const phase = store.exportState.phase
  if (phase === 'overlays') return 'Preparing overlays'
  if (phase === 'uploading') return 'Uploading'
  if (phase === 'queued') return 'Queued'
  if (phase === 'preparing') return 'Preparing'
  if (phase === 'rendering') return `Rendering ${progress.value}%`
  if (phase === 'verifying') return 'Verifying'
  return 'Exporting'
})

const downloadLabel = computed(() => {
  const bytes = store.exportState.bytes
  return bytes ? `Download ${formatBytes(bytes)}` : 'Download MP4'
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
    :aria-label="mode === 'busy' ? 'Cancel export' : mode === 'download' ? 'Download MP4' : 'Export MP4'"
    @click="onClick"
  >
    <span class="export-action__layer export-action__layer--default">
      <Download v-if="mode === 'export' || mode === 'download'" :size="16" />
      <span class="truncate">{{ mode === 'export' ? 'Export MP4' : mode === 'download' ? downloadLabel : busyLabel }}</span>
    </span>
    <span class="export-action__layer export-action__layer--cancel">
      <CircleX :size="16" />
      <span>Cancel</span>
    </span>
  </button>
</template>

<style scoped>
.export-action {
  position: relative;
  overflow: hidden;
  min-height: 2.35rem;
}

.export-action--busy {
  border: 1px solid #b8921f;
  background: #ffcc33;
  color: #1c1500;
  cursor: pointer;
}

.export-action--busy::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(28, 21, 0, 0.40);
  pointer-events: none;
}

.export-action--busy::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--progress, 0%);
  background: #ffcc33;
  pointer-events: none;
  transition: width 0.25s ease-out;
}

.export-action--busy:hover,
.export-action--busy:focus-visible {
  border-color: #7a3535;
  background: #3a1d1d;
  color: #fecaca;
}

.export-action--busy:hover::before,
.export-action--busy:focus-visible::before {
  background: rgba(0, 0, 0, 0.12);
}

.export-action--busy:hover::after,
.export-action--busy:focus-visible::after {
  background: #502020;
}

.export-action__layer {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  transition: opacity 0.15s ease;
}

.export-action__layer--cancel {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

.export-action--busy:hover .export-action__layer--default,
.export-action--busy:focus-visible .export-action__layer--default {
  opacity: 0;
}

.export-action--busy:hover .export-action__layer--cancel,
.export-action--busy:focus-visible .export-action__layer--cancel {
  opacity: 1;
}
</style>
