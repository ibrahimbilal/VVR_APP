<script setup lang="ts">
import { computed, toRef } from 'vue'
import { audioFormatLabel } from '../../lib/media'
import { formatBytes, formatClock } from '../../lib/format'
import { useAudioFileMeta } from '../../composables/useAudioFileMeta'
import FileDropZone from '../FileDropZone.vue'
import FileStatusBox from '../FileStatusBox.vue'

const props = withDefaults(
  defineProps<{
    fileName?: string | null
    fileSize?: number | null
    previewUrl?: string | null
    label?: string
    dropLabel?: string
    compact?: boolean
  }>(),
  {
    fileName: null,
    fileSize: null,
    previewUrl: null,
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

const { durationSec } = useAudioFileMeta(toRef(props, 'previewUrl'))

const formatLabel = computed(() => (props.fileName ? audioFormatLabel(props.fileName) : ''))

const metaParts = computed(() => {
  const parts: string[] = []
  if (formatLabel.value) parts.push(formatLabel.value)
  if (props.fileSize != null && props.fileSize > 0) parts.push(formatBytes(props.fileSize))
  if (durationSec.value != null) parts.push(formatClock(durationSec.value))
  return parts
})
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
    <FileStatusBox
      v-if="fileName"
      :file-name="fileName"
      status="ready"
      remove-label="Remove audio"
      @remove="emit('clear')"
    >
      <template v-if="metaParts.length > 0" #meta>
        {{ metaParts.join(' · ') }}
      </template>
    </FileStatusBox>
  </div>
</template>
