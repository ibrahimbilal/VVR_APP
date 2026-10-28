<script setup lang="ts">
import { onMounted } from 'vue'
import ThumbnailCanvas from './components/ThumbnailCanvas.vue'
import ThumbnailControls from './components/ThumbnailControls.vue'
import { useThumbnailStore } from './stores/thumbnail'

const store = useThumbnailStore()

onMounted(() => {
  void store.init().then(() => store.consumeStoredTransfer())
})
</script>

<template>
  <div class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden lg:flex-row">
    <ThumbnailCanvas />
    <ThumbnailControls />
    <div v-if="!store.hydrated" class="absolute inset-0 z-30 grid place-items-center bg-[#101114]/90 text-sm text-zinc-300">
      Restoring saved thumbnail…
    </div>
    <div v-if="store.promptOpen" class="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <div class="w-full max-w-md rounded-lg border border-zinc-800 bg-[#14161c] p-4">
        <h2 class="text-lg font-bold">Replace the open thumbnail?</h2>
        <p class="mt-2 text-sm text-zinc-400">An image is already open. The transferred picture replaces it only if you choose Replace.</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn btn-ghost cursor-pointer" type="button" @click="store.acceptTransfer('keep')">Keep current</button>
          <button class="btn btn-primary cursor-pointer" type="button" @click="store.acceptTransfer('replace')">Replace</button>
        </div>
      </div>
    </div>
  </div>
</template>
