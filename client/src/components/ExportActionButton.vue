<script setup lang="ts">
import { computed } from 'vue'
import AppExportAction from './ui/AppExportAction.vue'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()

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
  />
</template>
