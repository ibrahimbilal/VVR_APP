<script setup lang="ts">
import { computed } from 'vue'
import FileDropZone from '../../../components/FileDropZone.vue'
import FileStatusBox from '../../../components/FileStatusBox.vue'
import { formatBytes } from '../../../lib/format'
import { fileStatusBoxLabel } from '../../../lib/fileStatusBox'
import { audioFormatLabel } from '../../../lib/media'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()

const showImageStatusBox = computed(() => Boolean(store.imageFileName))

const imageMetaParts = computed(() => {
  const parts: string[] = []
  const name = store.imageFileName
  if (name && store.imageFileStatus === 'ready') parts.push(audioFormatLabel(name))
  if (store.imageFileSize != null && store.imageFileSize > 0) parts.push(formatBytes(store.imageFileSize))
  const w = store.doc.image.sourceWidth
  const h = store.doc.image.sourceHeight
  if (w > 0 && h > 0) parts.push(`${w}×${h}`)
  return parts
})

const imageStatusLabel = computed(() =>
  fileStatusBoxLabel(store.imageFileStatus, { processingMessage: 'Reading image…' }),
)

function onFiles(files: File[]): void {
  const file = files[0]
  if (file) void store.uploadImage(file)
}

async function updateFromScreensaver(): Promise<void> {
  store.requestReplaceOnNextTransfer()
  const { createThumbnailFromScreensaver } = await import('../../frame-screensaver/lib/createThumbnail')
  await createThumbnailFromScreensaver(store.doc.source.linkMode === 'linked' ? 'linked' : 'snapshot')
  store.clearReplaceOnNextTransfer()
}
</script>

<template>
  <aside class="studio-panel flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto p-4 lg:h-full lg:w-[300px] lg:max-w-[300px] lg:flex-none">
    <label class="block">
      <span class="section-label mb-1 block">Project</span>
      <input
        class="field text-sm font-semibold"
        maxlength="80"
        type="text"
        :value="store.doc.name"
        @input="store.setName(($event.target as HTMLInputElement).value)"
      />
    </label>
    <div class="space-y-3">
      <p class="section-label">Image</p>
      <FileDropZone
        compact
        accept="image/png,image/jpeg,image/webp"
        :label="store.hasImage ? 'Replace image' : 'Upload image'"
        formats="PNG, JPEG, WebP"
        @files="onFiles"
      />
      <FileStatusBox
        v-if="showImageStatusBox && store.imageFileName"
        :file-name="store.imageFileName"
        :status="store.imageFileStatus"
        :status-label="imageStatusLabel"
        remove-label="Remove image"
        @remove="void store.clearImage()"
      >
        <template #meta>
          <span v-if="imageMetaParts.length > 0">{{ imageMetaParts.join(' · ') }}</span>
          <span v-if="store.imageFileError" class="text-red-300">
            <span v-if="imageMetaParts.length > 0"> · </span>{{ store.imageFileError }}
          </span>
        </template>
      </FileStatusBox>
      <p v-if="store.hasComposition" class="text-xs leading-5 text-zinc-400">
        Screensaver crop, placement, and frame are already in this image.
      </p>
      <button v-if="store.doc.source.app === 'frame-screensaver'" class="btn btn-ghost w-full cursor-pointer" type="button" @click="updateFromScreensaver">
        Update from Screensaver
      </button>
    </div>
  </aside>
</template>
