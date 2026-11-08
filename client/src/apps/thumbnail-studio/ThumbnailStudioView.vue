<script setup lang="ts">
import { onMounted } from 'vue'
import AppDialog from '../../components/ui/AppDialog.vue'
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
    <div v-if="!store.hydrated" class="scrim">
      Restoring saved thumbnail…
    </div>
    <AppDialog :open="store.promptOpen" title="Replace the open thumbnail?" @cancel="store.acceptTransfer('keep')">
      <p class="text-sm text-zinc-400">An image is already open. The transferred picture replaces it only if you choose Replace.</p>
      <template #actions>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.acceptTransfer('keep')">Keep current</button>
        <button class="btn btn-primary cursor-pointer" type="button" @click="store.acceptTransfer('replace')">Replace</button>
      </template>
    </AppDialog>
  </div>
</template>
