<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes } from '../../../lib/format'
import { audioFormatLabel } from '../../../lib/media'
import FileDropZone from '../../../components/FileDropZone.vue'
import FileStatusBox from '../../../components/FileStatusBox.vue'
import { fileStatusBoxLabel, type FileStatusBoxStatus } from '../../../lib/fileStatusBox'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()

const accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm'

function onFiles(files: File[]) {
  const file = files[0]
  if (file) void store.pickSource(file)
}

const metaParts = computed(() => {
  const parts: string[] = []
  if (store.fileName) parts.push(audioFormatLabel(store.fileName))
  if (store.sourceFileSize != null && store.sourceFileSize > 0) parts.push(formatBytes(store.sourceFileSize))
  if (store.width > 0 && store.height > 0) parts.push(`${store.width}×${store.height}`)
  if (store.sourceDuration) parts.push(`${Math.round(store.sourceDuration)}s`)
  return parts
})

const fileStatus = computed((): FileStatusBoxStatus => {
  if (store.uploadState === 'uploading') return 'uploading'
  if (store.uploadState === 'error') return 'error'
  return 'ready'
})

const statusLabel = computed(() =>
  fileStatusBoxLabel(fileStatus.value, { uploadProgress: store.uploadProgress }),
)
</script>

<template>
  <section class="space-y-3">
    <h3 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Visual source</h3>

    <div v-if="store.objectUrl" class="rounded-lg border border-zinc-800 bg-[#16181d] p-3">
      <div class="aspect-video overflow-hidden rounded-md bg-black">
        <img v-if="store.mediaKind === 'image'" :src="store.objectUrl" alt="" class="h-full w-full object-contain" />
        <video v-else :src="store.objectUrl" class="h-full w-full object-contain" muted playsinline />
      </div>
      <FileStatusBox
        v-if="store.fileName"
        class="mt-2"
        :file-name="store.fileName"
        :status="fileStatus"
        :status-label="statusLabel"
        remove-label="Remove media"
        @remove="store.removeSource()"
      >
        <template #meta>
          <span v-if="metaParts.length > 0">{{ metaParts.join(' · ') }}</span>
          <span v-if="store.uploadState === 'error' && store.uploadError" class="text-red-300">
            <span v-if="metaParts.length > 0"> · </span>{{ store.uploadError }}
          </span>
        </template>
      </FileStatusBox>
      <FileDropZone
        class="mt-3"
        compact
        :accept="accept"
        label="Drop a new file here"
        drop-label="Drop to replace"
        hint="or click to browse"
        @files="onFiles"
      />
    </div>

    <FileDropZone
      v-else
      :accept="accept"
      label="Drop image or video here"
      formats="JPG, PNG, WebP, MP4, MOV, WebM"
      @files="onFiles"
    />
  </section>
</template>
