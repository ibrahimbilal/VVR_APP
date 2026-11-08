<script setup lang="ts">
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
    <button class="btn btn-ghost cursor-pointer" type="button" :disabled="disabled" @click="emit('create')">
      Create Thumbnail
    </button>
  </div>
</template>
