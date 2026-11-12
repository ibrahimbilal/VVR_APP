<script setup lang="ts">
import FileDropZone from '../../../components/FileDropZone.vue'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
</script>

<template>
  <FileDropZone
    compact
    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
    multiple
    :disabled="store.processing"
    :label="store.items.length ? 'Add images' : 'Drop images here'"
    :drop-label="store.items.length ? 'Drop to add' : 'Drop to upload'"
    formats="PNG, JPEG, WebP"
    @files="store.addFiles"
  />
</template>
