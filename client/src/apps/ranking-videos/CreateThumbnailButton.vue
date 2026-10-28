<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayback } from '../../composables/usePlayback'
import { usePlatformStore } from '../../stores/platform'
import { useProjectStore } from '../../stores/project'
import ToggleSwitch from '../../components/ToggleSwitch.vue'
import { blobFromThumbnail, captureVideoFrame, createThumbnailFromRanking } from './createThumbnail'

const store = useProjectStore()
const platform = usePlatformStore()
const playback = usePlayback()
const open = ref(false)
const linkMode = ref(false)
const busy = ref(false)

const choices = computed(() => store.clips.filter((clip) => clip.thumbnail))

async function useClip(thumbnail: string): Promise<void> {
  busy.value = true
  try {
    const blob = await blobFromThumbnail(thumbnail)
    await createThumbnailFromRanking(blob, linkMode.value ? 'linked' : 'snapshot')
    open.value = false
  } catch (error) {
    platform.toast(error instanceof Error ? error.message : 'Could not create a thumbnail.')
  } finally {
    busy.value = false
  }
}

async function useCurrentFrame(): Promise<void> {
  const video = [playback.videoA.value, playback.videoB.value].find((item) => item && item.readyState >= 2 && item.videoWidth > 1) ?? null
  const blob = await captureVideoFrame(video)
  if (!blob) {
    platform.toast('Play the preview to a frame, or pick a clip image.')
    return
  }
  await useBlob(blob)
}

async function useBlob(blob: Blob): Promise<void> {
  busy.value = true
  try {
    await createThumbnailFromRanking(blob, linkMode.value ? 'linked' : 'snapshot')
    open.value = false
  } catch (error) {
    platform.toast(error instanceof Error ? error.message : 'Could not create a thumbnail.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-end gap-3 border-t border-zinc-800 px-3 py-2">
    <div class="flex items-center gap-2 text-xs text-zinc-400">
      <ToggleSwitch v-model="linkMode" aria-label="Link to source" />
      <span>Link to source</span>
    </div>
    <button class="btn btn-ghost cursor-pointer" type="button" :disabled="choices.length === 0" @click="open = true">Create Thumbnail</button>
    <div v-if="open" class="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <div class="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-800 bg-[#14161c] p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold">Choose a thumbnail frame</h2>
          <button class="btn btn-ghost cursor-pointer" type="button" @click="open = false">Close</button>
        </div>
        <button class="btn btn-primary mt-3 cursor-pointer" type="button" :disabled="busy" @click="useCurrentFrame">Use current preview frame</button>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <button
            v-for="clip in choices"
            :key="clip.id"
            class="cursor-pointer rounded border border-zinc-800 p-2 text-left hover:border-amber-300"
            type="button"
            :disabled="busy"
            @click="useClip(clip.thumbnail!)"
          >
            <img :src="clip.thumbnail!" alt="" class="aspect-[9/16] w-full object-cover" />
            <span class="mt-2 block truncate text-sm">{{ clip.title }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
