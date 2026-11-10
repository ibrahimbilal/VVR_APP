<script setup lang="ts">
import { computed } from 'vue'
import AppExportAction from '../../../components/ui/AppExportAction.vue'
import { useImageMotionStore } from '../stores/imageMotion'

const store = useImageMotionStore()
const label = computed(() => (store.activeExportCount > 0 ? 'Queue export' : 'Export MP4'))
</script>

<template>
  <AppExportAction
    :label="label"
    :disabled="Boolean(store.exportBlocker)"
    :blocker="store.exportBlocker"
    @export="void store.startExport()"
  />
</template>
