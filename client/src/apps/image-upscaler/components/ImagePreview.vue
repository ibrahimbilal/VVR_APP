<script setup lang="ts">
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
</script>

<template>
  <div class="grid h-full min-h-[240px] place-items-center overflow-hidden rounded-xl border border-zinc-800 bg-black">
    <img
      v-if="store.selected"
      :src="store.selected.previewUrl"
      :alt="`Preview of ${store.selected.name}`"
      class="max-h-full max-w-full object-contain"
    />
    <p v-else class="px-6 text-center text-sm text-zinc-500">Add an image to preview it. Nothing is resized until you upscale.</p>
  </div>
</template>
