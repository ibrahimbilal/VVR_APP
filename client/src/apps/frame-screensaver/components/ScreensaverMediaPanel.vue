<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import FileDropZone from '../../../components/FileDropZone.vue'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()

const accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm'

function onFiles(files: File[]) {
  const file = files[0]
  if (file) void store.pickSource(file)
}
</script>

<template>
  <section class="space-y-3">
    <h3 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Visual source</h3>

    <div v-if="store.objectUrl" class="rounded-lg border border-zinc-800 bg-[#16181d] p-3">
      <div class="aspect-video overflow-hidden rounded-md bg-black">
        <img v-if="store.mediaKind === 'image'" :src="store.objectUrl" alt="" class="h-full w-full object-contain" />
        <video v-else :src="store.objectUrl" class="h-full w-full object-contain" muted playsinline />
      </div>
      <p class="mt-2 truncate text-sm font-semibold text-zinc-200">{{ store.fileName }}</p>
      <p class="text-xs text-zinc-500">
        {{ store.width }}×{{ store.height }}
        <span v-if="store.sourceDuration"> · {{ Math.round(store.sourceDuration) }}s</span>
        <span v-if="store.uploadState === 'uploading'"> · Uploading {{ Math.round(store.uploadProgress * 100) }}%</span>
        <span v-if="store.uploadState === 'ready'" class="text-emerald-400"> · Ready</span>
        <span v-if="store.uploadState === 'error'" class="text-red-300"> · {{ store.uploadError }}</span>
      </p>
      <FileDropZone
        class="mt-3"
        compact
        :accept="accept"
        label="Drop a new file here"
        drop-label="Drop to replace"
        hint="or click to browse"
        @files="onFiles"
      />
      <div class="mt-2 flex gap-2">
        <button class="btn btn-ghost cursor-pointer flex-1" type="button" @click="store.removeSource()">
          <Trash2 :size="16" />
          Remove
        </button>
      </div>
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
