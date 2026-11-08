<script setup lang="ts">
defineProps<{
  title: string
  text?: string
}>()
</script>

<template>
  <div class="empty-state">
    <p class="text-sm font-semibold text-zinc-200">{{ title }}</p>
    <p v-if="text" class="mt-1 text-sm leading-relaxed text-zinc-500">{{ text }}</p>
    <slot />
  </div>
</template>
