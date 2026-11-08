<script setup lang="ts">
import { computed } from 'vue'
import AppExportAction from '../../../components/ui/AppExportAction.vue'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()

const label = computed(() =>
  store.activeExportCount > 0 ? 'Queue export' : 'Export MP4',
)
</script>

<template>
  <AppExportAction
    :label="label"
    :disabled="Boolean(store.exportBlocker)"
    :blocker="store.exportBlocker"
    @export="void store.startExport()"
  >
    <p v-if="store.exportState.error" class="mt-2 text-xs text-red-300">{{ store.exportState.error }}</p>
    <button
      v-if="store.exportState.error && store.encoder !== 'cpu' && store.encoder !== 'auto'"
      class="btn btn-ghost mt-2 cursor-pointer"
      type="button"
      @click="store.exportWithCpu()"
    >
      Export with CPU instead
    </button>
  </AppExportAction>
</template>
