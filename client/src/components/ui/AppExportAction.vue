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
    <p v-if="blocker" class="mt-2 text-xs text-zinc-500">{{ blocker }}</p>
    <p v-else-if="hint" class="mt-2 text-xs text-zinc-500">{{ hint }}</p>
    <slot />
  </div>
</template>
