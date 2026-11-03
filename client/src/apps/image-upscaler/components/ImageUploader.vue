<script setup lang="ts">
import { formatBytes } from '@shared/imageUpscaler'
import FileDropZone from '../../../components/FileDropZone.vue'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
</script>

<template>
  <FileDropZone
    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
    multiple
    :disabled="store.processing"
    label="Add images"
    drop-label="Drop images"
    hint="PNG, JPEG, or WebP. Processing starts only when you choose Upscale Images."
    :formats="`Up to ${store.limits.maxBatch} images, ${formatBytes(store.limits.maxFileBytes)} each`"
    @files="store.addFiles"
  />
</template>
