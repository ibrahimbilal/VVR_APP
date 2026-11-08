<script setup lang="ts">
import FileDropZone from '../../../components/FileDropZone.vue'
import FileStatusBox from '../../../components/FileStatusBox.vue'
import { useAudioLooperStore } from '../stores/audioLooper'

const store = useAudioLooperStore()

function onFiles(files: File[]): void {
  const file = files[0]
  if (file) void store.pickFile(file)
}
</script>

<template>
  <div class="space-y-3">
    <FileDropZone
      accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg"
      label="Drop audio here"
      drop-label="Drop to upload"
      formats="MP3, WAV, FLAC, M4A, AAC, OGG"
      :highlighted="false"
      @files="onFiles"
    />
    <FileStatusBox
      v-if="store.fileName"
      :file-name="store.fileName"
      status="ready"
      remove-label="Remove audio"
      @remove="store.clearFile()"
    >
      <template v-if="store.sourceMetaLabel" #meta>
        {{ store.sourceMetaLabel }}
      </template>
    </FileStatusBox>
    <p v-if="store.pickError" class="text-xs text-red-300">{{ store.pickError }}</p>
  </div>
</template>
