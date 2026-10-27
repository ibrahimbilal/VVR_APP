<script setup lang="ts">
import FileDropZone from '../FileDropZone.vue'

withDefaults(
  defineProps<{
    fileName?: string | null
    label?: string
    dropLabel?: string
    compact?: boolean
  }>(),
  {
    fileName: null,
    label: 'Drop audio here',
    dropLabel: 'Drop to upload',
    compact: true,
  },
)

const emit = defineEmits<{
  files: [files: File[]]
  clear: []
}>()

const accept = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg'
</script>

<template>
  <div class="space-y-2">
    <FileDropZone
      :compact="compact"
      :accept="accept"
      :label="fileName ? 'Drop a new audio file here' : label"
      :drop-label="fileName ? 'Drop to replace' : dropLabel"
      formats="MP3, WAV, M4A, AAC, OGG"
      @files="emit('files', $event)"
    />
    <p v-if="fileName" class="truncate text-xs text-zinc-500">{{ fileName }}</p>
    <button v-if="fileName" class="btn btn-ghost w-full cursor-pointer text-xs" type="button" @click="emit('clear')">
      Remove audio
    </button>
  </div>
</template>
