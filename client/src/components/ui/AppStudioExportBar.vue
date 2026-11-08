<script setup lang="ts">
defineProps<{
  status?: string
  error?: boolean
}>()
</script>

<template>
  <div class="studio-panel flex shrink-0 flex-wrap items-center gap-3 p-3">
    <p class="min-w-0 flex-1 truncate text-sm" :class="error ? 'text-red-300' : 'text-zinc-300'">
      <slot name="status">{{ status }}</slot>
    </p>
    <slot name="actions" />
    <div class="w-full sm:w-64">
      <slot />
    </div>
  </div>
</template>
