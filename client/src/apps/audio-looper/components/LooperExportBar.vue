<script setup lang="ts">
import { computed } from 'vue'
import { useAudioLooperStore } from '../stores/audioLooper'

const store = useAudioLooperStore()

const label = computed(() => (store.activeExportCount > 0 ? 'Queue export' : 'Export loop'))

const status = computed(() => {
  const state = store.exportState
  if (state.phase === 'queued' && state.message) return state.message
  if (state.phase === 'error') return state.error || 'Export failed.'
  if (state.phase === 'cancelled') return 'Export cancelled.'
  if (state.message) return state.message
  return null
})

const progressLabel = computed(() => {
  const progress = store.exportState.progress
  if (progress == null || store.exportState.phase === 'idle') return null
  return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`
})
</script>

<template>
  <div>
    <button
      class="btn btn-primary w-full cursor-pointer"
      type="button"
      :disabled="Boolean(store.exportBlocker)"
      @click="store.startExport()"
    >
      {{ label }}
    </button>
    <p v-if="store.exportBlocker" class="mt-2 text-xs text-zinc-500">{{ store.exportBlocker }}</p>
    <p v-else class="mt-2 text-xs text-zinc-500">Progress, cancel, and download stay in the header notification panel.</p>
    <div v-if="status" class="mt-3 rounded-lg border border-zinc-800 bg-[#101114] p-3 text-xs text-zinc-400">
      <p class="text-zinc-200">{{ status }}</p>
      <p v-if="progressLabel" class="mt-1 tabular-nums">{{ progressLabel }}</p>
    </div>
  </div>
</template>
