<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { webGl2Available } from '../lib/render/createScreensaverRenderer'
import {
  exportPrepSnapshot,
  previewMetricsSnapshot,
  screensaverDiagnosticsEnabled,
  setScreensaverDiagnosticsEnabled,
  webGlContextLossCount,
} from '../lib/previewMetrics'

const visible = ref(screensaverDiagnosticsEnabled())
const tick = ref(0)
let timer = 0

const metrics = computed(() => {
  void tick.value
  return previewMetricsSnapshot()
})
const exportPrep = computed(() => {
  void tick.value
  return exportPrepSnapshot()
})

onMounted(() => {
  visible.value = screensaverDiagnosticsEnabled()
  timer = window.setInterval(() => {
    if (visible.value) tick.value += 1
  }, 500)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
})

function toggle(): void {
  visible.value = !visible.value
  setScreensaverDiagnosticsEnabled(visible.value)
}
</script>

<template>
  <div class="pointer-events-auto fixed bottom-4 right-4 z-40 max-w-xs">
    <button class="btn btn-ghost cursor-pointer text-xs" type="button" @click="toggle">
      {{ visible ? 'Hide' : 'Show' }} preview diagnostics
    </button>
    <div v-if="visible" class="mt-2 rounded-lg border border-zinc-700 bg-[#101114]/95 p-3 text-xs text-zinc-300 shadow-lg">
      <p><span class="text-zinc-500">Backend:</span> {{ metrics.lastBackend }}</p>
      <p><span class="text-zinc-500">WebGL2 available:</span> {{ webGl2Available() ? 'yes' : 'no' }}</p>
      <p><span class="text-zinc-500">Context losses:</span> {{ webGlContextLossCount() }}</p>
      <p><span class="text-zinc-500">Preview FPS:</span> {{ metrics.fps != null ? metrics.fps.toFixed(1) : 'not measured' }}</p>
      <p><span class="text-zinc-500">Avg draw:</span> {{ metrics.avgDrawMs != null ? `${metrics.avgDrawMs.toFixed(2)} ms` : 'not measured' }}</p>
      <p><span class="text-zinc-500">Avg bake (CPU):</span> {{ metrics.avgBakeMs != null ? `${metrics.avgBakeMs.toFixed(2)} ms` : 'n/a' }}</p>
      <p><span class="text-zinc-500">Avg composite:</span> {{ metrics.avgCompositeMs != null ? `${metrics.avgCompositeMs.toFixed(2)} ms` : 'not measured' }}</p>
      <p><span class="text-zinc-500">Last export prep:</span> {{ exportPrep.ms != null ? `${exportPrep.ms.toFixed(0)} ms` : 'not measured' }}</p>
      <p><span class="text-zinc-500">Export worker:</span> {{ exportPrep.ms != null ? (exportPrep.usedWorker ? 'yes' : 'no') : 'not measured' }}</p>
      <p class="mt-2 text-zinc-500">Enable with ?screensaver_diag=1 or localStorage vvr-screensaver-diagnostics=1</p>
    </div>
  </div>
</template>
