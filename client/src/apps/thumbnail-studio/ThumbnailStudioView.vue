<script setup lang="ts">
import { Image as ImageIcon, MonitorPlay, SlidersHorizontal } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import AppDialog from '../../components/ui/AppDialog.vue'
import AppMobileTabs from '../../components/ui/AppMobileTabs.vue'
import ThumbnailCanvas from './components/ThumbnailCanvas.vue'
import ThumbnailControls from './components/ThumbnailControls.vue'
import ThumbnailSourcePanel from './components/ThumbnailSourcePanel.vue'
import { useThumbnailStore } from './stores/thumbnail'

const store = useThumbnailStore()
const tab = ref<'source' | 'preview' | 'settings'>('preview')
const tabs = [
  { id: 'source' as const, label: 'Source', icon: ImageIcon },
  { id: 'preview' as const, label: 'Preview', icon: MonitorPlay },
  { id: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
]

onMounted(() => {
  void store.init().then(() => store.consumeStoredTransfer())
})
</script>

<template>
  <div class="relative flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
    <AppMobileTabs v-model="tab" :items="tabs" />
    <ThumbnailSourcePanel :class="tab === 'source' ? 'flex max-h-none flex-1' : 'hidden lg:flex'" />
    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      :class="tab === 'preview' ? 'flex' : 'hidden lg:flex'"
    >
      <ThumbnailCanvas class="min-h-0 flex-1" />
    </div>
    <ThumbnailControls :class="tab === 'settings' ? 'flex max-h-none flex-1' : 'hidden lg:flex'" />
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
