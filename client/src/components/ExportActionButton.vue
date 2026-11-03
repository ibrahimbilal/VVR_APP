<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()

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
  <p v-if="store.exportBlocker" class="mt-1 text-center text-[10px] text-zinc-500">{{ store.exportBlocker }}</p>
</template>
