<script setup lang="ts">
import FileDropZone from '../../../components/FileDropZone.vue'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()

const accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'

function onFiles(files: File[]) {
  if (files.length) void store.addImageFiles(files)
}

async function updateFromScreensaver(): Promise<void> {
  store.requestReplaceOnNextTransfer()
  const { createThumbnailFromScreensaver } = await import('../../frame-screensaver/lib/createThumbnail')
  await createThumbnailFromScreensaver(store.doc.source.linkMode === 'linked' ? 'linked' : 'snapshot')
  store.clearReplaceOnNextTransfer()
}
</script>

<template>
  <section class="shrink-0 space-y-3">
    <h3 class="section-label">Image</h3>
    <FileDropZone
      multiple
      compact
      :accept="accept"
      label="Drop images here"
      formats="PNG, JPEG, WebP"
      @files="onFiles"
    />
    <p v-if="store.hasComposition" class="text-xs leading-5 text-zinc-400">
      Screensaver crop, placement, and frame are already in this image.
    </p>
    <button
      v-if="store.doc.source.app === 'frame-screensaver'"
      class="btn btn-ghost w-full cursor-pointer"
      type="button"
      @click="updateFromScreensaver"
    >
      Update from Screensaver
    </button>
  </section>
</template>
