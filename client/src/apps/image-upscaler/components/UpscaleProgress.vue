<script setup lang="ts">
import { computed } from 'vue'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
const active = computed(() => store.items.find((item) => item.status === 'processing'))
const finished = computed(() => store.items.filter((item) => item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled').length)
</script>

<template>
  <div v-if="store.processing || store.completedCount || store.items.some((item) => item.status === 'failed')" class="rounded-lg border border-zinc-800 bg-inset p-3" aria-live="polite">
    <div class="flex items-center justify-between gap-3 text-xs text-zinc-300">
      <span>{{ finished }} of {{ store.items.length }} finished</span>
      <span v-if="active">Processing {{ active.name }}</span>
      <span v-else-if="store.processing">Waiting</span>
    </div>
    <div v-if="store.processing" class="mt-2 h-1 overflow-hidden rounded bg-zinc-800">
      <div class="upscale-indeterminate h-full w-1/3 rounded bg-brand"></div>
    </div>
    <p v-if="store.processing && store.jobEngine === 'realesrgan-lite'" class="mt-2 text-xs text-zinc-500">AI Lite is reconstructing this image. Cancel stops that process. It does not report a percentage.</p>
    <p v-else class="mt-2 text-xs text-zinc-500">Progress is shown per image. The active resize does not report a percentage.</p>
  </div>
</template>

<style scoped>
.upscale-indeterminate {
  animation: upscale-slide 1.1s ease-in-out infinite;
}
@keyframes upscale-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}
</style>
