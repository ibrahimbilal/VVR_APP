<script setup lang="ts">
import { ref } from 'vue'
import FileDropZone from '../../../components/FileDropZone.vue'
import AppDialog from '../../../components/ui/AppDialog.vue'
import { useAudioLooperStore } from '../stores/audioLooper'
import LooperTrackList from './LooperTrackList.vue'

const store = useAudioLooperStore()
const confirmClear = ref(false)

function onFiles(files: File[]): void {
  if (files.length) void store.addFiles(files)
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 space-y-3 border-b border-zinc-800 p-4">
      <label class="block">
        <span class="section-label mb-1 block">Project</span>
        <input v-model="store.name" class="field text-sm font-semibold" type="text" maxlength="80" />
      </label>
      <FileDropZone
        compact
        accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg"
        multiple
        :label="store.hasSource ? 'Add audio' : 'Drop audio here'"
        :drop-label="store.hasSource ? 'Drop to add' : 'Drop to upload'"
        formats="MP3, WAV, FLAC, M4A, AAC, OGG"
        @files="onFiles"
      />
      <p v-if="store.pickError" class="text-xs text-red-300">{{ store.pickError }}</p>
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <p v-if="!store.hasSource" class="px-2 py-8 text-center text-sm text-zinc-500">
        Drop audio above. One file loops. Two or more become a playlist.
      </p>
      <template v-else>
        <LooperTrackList />
        <button
          v-if="store.trackCount > 1"
          class="btn btn-ghost cursor-pointer w-full text-xs"
          type="button"
          @click="confirmClear = true"
        >
          Clear all tracks
        </button>
      </template>
    </div>

    <AppDialog :open="confirmClear" title="Remove all tracks?" @cancel="confirmClear = false">
      <p class="text-sm text-zinc-400">This clears the tracks in this session. Exported files already in progress stay in the notification panel.</p>
      <template #actions>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="confirmClear = false">Keep tracks</button>
        <button
          class="btn btn-danger cursor-pointer"
          type="button"
          @click="store.clearTracks(); confirmClear = false"
        >
          Remove all
        </button>
      </template>
    </AppDialog>
  </div>
</template>
