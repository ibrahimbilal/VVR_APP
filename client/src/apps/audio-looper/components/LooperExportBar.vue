<script setup lang="ts">
import { computed } from 'vue'
import AppExportAction from '../../../components/ui/AppExportAction.vue'
import { useAudioLooperStore } from '../stores/audioLooper'

const store = useAudioLooperStore()

const label = computed(() => (store.activeExportCount > 0 ? 'Queue export' : 'Export loop'))
</script>

<template>
  <AppExportAction
    :label="label"
    :disabled="Boolean(store.exportBlocker)"
    :blocker="store.exportBlocker"
    hint="Progress, cancel, and download stay in the header notification panel."
    @export="store.startExport()"
  >
  </AppExportAction>
</template>
