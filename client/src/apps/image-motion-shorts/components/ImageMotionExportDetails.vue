<script setup lang="ts">
import { computed, ref } from 'vue'
import AppExportStatusPanel from '../../../components/ui/AppExportStatusPanel.vue'
import { formatClock } from '../../../lib/format'
import { useImageMotionStore } from '../stores/imageMotion'

const store = useImageMotionStore()
const open = ref(false)

const visible = computed(
  () => store.exporting || Boolean(store.exportState.encoder) || store.exportState.phase === 'done',
)

const tone = computed(() => {
  if (store.exportState.phase === 'error') return 'error' as const
  if (store.exportState.phase === 'done') return 'done' as const
  return 'active' as const
})

const totalFrames = computed(() => Math.max(1, Math.round(store.duration * store.video.fps)))

const renderedFramesLabel = computed(() => {
  const enc = store.exportState.encodeProgress
  if (enc == null) return '—'
  const rendered = Math.min(totalFrames.value, Math.max(0, Math.round(totalFrames.value * enc)))
  return `${rendered.toLocaleString()} / ${totalFrames.value.toLocaleString()}`
})

function formatSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const rows = computed(() => [
  { label: 'Stage', value: store.exportState.stage || store.exportState.message || '—' },
  { label: 'Total frames', value: totalFrames.value.toLocaleString() },
  { label: 'Rendered frames', value: renderedFramesLabel.value },
  { label: 'Encoding', value: store.exportState.encoder || '—' },
  {
    label: 'Acceleration',
    value: store.exportState.hardware == null ? '—' : store.exportState.hardware ? 'Active' : 'Off',
  },
  {
    label: 'Speed',
    value: store.exportState.encodeSpeed != null ? `${store.exportState.encodeSpeed.toFixed(2)}x realtime` : '—',
  },
  {
    label: 'Encode fps',
    value: store.exportState.encodeFps != null ? store.exportState.encodeFps.toFixed(1) : '—',
  },
  { label: 'Elapsed', value: formatSeconds(store.exportState.elapsedSec) },
  {
    label: 'Remaining',
    value: store.exportState.etaSec == null ? 'Estimating…' : formatSeconds(store.exportState.etaSec),
  },
  {
    label: 'Output',
    value: `${store.video.width}×${store.video.height} · ${store.video.fps} fps · ${formatClock(store.duration)}`,
  },
])
</script>

<template>
  <AppExportStatusPanel
    v-if="visible"
    :open="open"
    :rows="rows"
    :progress="store.exportState.progress"
    :tone="tone"
    @toggle="open = !open"
  />
</template>
