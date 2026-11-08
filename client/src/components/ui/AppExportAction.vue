<script setup lang="ts">
defineProps<{
  label: string
  disabled?: boolean
  blocker?: string | null
  hint?: string | null
}>()

const emit = defineEmits<{
  export: []
}>()
</script>

<template>
  <div>
    <button class="btn btn-primary w-full cursor-pointer" type="button" :disabled="disabled" @click="emit('export')">
      {{ label }}
    </button>
    <slot />
  </div>
</template>
