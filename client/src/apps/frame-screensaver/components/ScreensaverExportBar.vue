<script setup lang="ts">
import { computed } from 'vue'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()

const label = computed(() =>
  store.activeExportCount > 0 ? 'Queue export' : 'Export MP4',
)
</script>

<template>
  <button
    class="btn btn-primary w-full"
    type="button"
    :disabled="Boolean(store.exportBlocker)"
    @click="void store.startExport()"
  >
    {{ label }}
  </button>
  <p v-if="store.exportBlocker" class="mt-2 text-xs text-zinc-500">{{ store.exportBlocker }}</p>
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
