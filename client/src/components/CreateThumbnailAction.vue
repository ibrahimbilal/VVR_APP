<script setup lang="ts">
import { ImagePlus } from '@lucide/vue'
import ToggleSwitch from './ToggleSwitch.vue'

defineProps<{
  disabled?: boolean
}>()

const linkMode = defineModel<boolean>('link', { default: false })

const emit = defineEmits<{
  create: []
}>()
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="flex items-center gap-2 text-xs text-zinc-400">
      <ToggleSwitch v-model="linkMode" aria-label="Link to source" />
      <span>Link to source</span>
    </div>
    <button
      class="btn btn-ghost cursor-pointer px-2"
      type="button"
      aria-label="Create Thumbnail"
      title="Create Thumbnail"
      :disabled="disabled"
      @click="emit('create')"
    >
      <ImagePlus :size="18" />
    </button>
  </div>
</template>
