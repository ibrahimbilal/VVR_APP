<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <section class="panel">
    <p v-if="title" class="section-label">{{ title }}</p>
    <div :class="title ? 'mt-3' : undefined">
      <slot />
    </div>
  </section>
</template>
