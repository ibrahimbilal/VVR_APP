<script setup lang="ts">
import { Download, Image as ImageIcon, MonitorPlay, SlidersHorizontal, Sparkles } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import AppDialog from '../../components/ui/AppDialog.vue'
import AppMobileTabs from '../../components/ui/AppMobileTabs.vue'
import ImageBatchList from './components/ImageBatchList.vue'
import ImageComparison from './components/ImageComparison.vue'
import ImagePreview from './components/ImagePreview.vue'
import ImageUploader from './components/ImageUploader.vue'
import UpscaleProgress from './components/UpscaleProgress.vue'
import UpscaleSettings from './components/UpscaleSettings.vue'
import { useImageUpscaler } from './composables/useImageUpscaler'

const store = useImageUpscaler()
const showComparison = computed(() => store.selected?.status === 'completed' && Boolean(store.selected.serverItemId))
const canSend = computed(() => showComparison.value)
const hasImages = computed(() => store.items.length > 0)
const tab = ref<'source' | 'preview' | 'settings'>(hasImages.value ? 'preview' : 'source')
const tabs = [
  { id: 'source' as const, label: 'Source', icon: ImageIcon },
  { id: 'preview' as const, label: 'Preview', icon: MonitorPlay },
  { id: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
]

watch(hasImages, (has) => {
  if (!has) tab.value = 'source'
  else if (tab.value === 'source') tab.value = 'preview'
})
</script>

<template>
  <div class="relative flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
    <AppMobileTabs v-model="tab" :items="tabs" />

    <aside
      class="studio-panel flex min-h-0 w-full shrink-0 flex-col overflow-hidden lg:h-full lg:w-[300px] lg:max-w-[300px] lg:flex-none"
      :class="tab === 'source' ? 'max-h-none flex-1' : 'hidden lg:flex'"
    >
      <div class="shrink-0 space-y-3 border-b border-zinc-800 p-4">
        <label class="block">
          <span class="section-label mb-1 block">Project</span>
          <input v-model="store.name" class="field text-sm font-semibold" type="text" maxlength="80" />
        </label>
        <ImageUploader />
      </div>
      <ImageBatchList />
    </aside>

    <section
      class="studio-stage flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      :class="tab === 'preview' ? 'flex' : 'hidden lg:flex'"
    >
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {{ showComparison ? 'Before / after' : 'Preview' }}
        </p>
      </div>
      <ImageComparison v-if="showComparison" />
      <ImagePreview v-else />
      <UpscaleProgress />
      <div v-if="store.selected?.status === 'completed'" class="flex flex-wrap gap-2">
        <button class="btn btn-primary cursor-pointer" type="button" @click="store.downloadItem(store.selected.localId)">
          <Download :size="15" />
          Download
        </button>
        <button v-if="store.completedCount > 1" class="btn btn-ghost cursor-pointer" type="button" @click="store.downloadZip()">
          <Download :size="15" />
          Download all ZIP
        </button>
        <button class="btn btn-ghost cursor-pointer" type="button" :disabled="!canSend" @click="store.requestSend(store.selected.localId)">
          <MonitorPlay :size="15" />
          Send to Screensaver
        </button>
      </div>
    </section>

    <aside
      class="studio-panel flex min-h-0 w-full shrink-0 flex-col lg:h-full lg:w-[360px] lg:max-w-[360px] lg:flex-none"
      :class="tab === 'settings' ? 'max-h-none flex-1' : 'hidden lg:flex'"
    >
      <div class="shrink-0 border-b border-zinc-800">
        <h2 class="px-4 py-4 text-sm font-bold text-zinc-100">Settings</h2>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <UpscaleSettings />
      </div>
      <div class="mt-auto flex shrink-0 flex-col gap-2 border-t border-zinc-800 p-4">
        <button class="btn btn-primary cursor-pointer py-3" type="button" :disabled="store.items.length === 0 || store.processing" @click="store.upscale()">
          <Sparkles :size="16" />
          Upscale Images
        </button>
        <button v-if="store.processing" class="btn btn-danger cursor-pointer" type="button" @click="store.cancel()">Cancel</button>
      </div>
    </aside>

    <AppDialog
      :open="Boolean(store.confirmSendId)"
      title="Replace the Screensaver source?"
      @cancel="store.resolveSend('cancel')"
    >
      <p class="text-sm text-zinc-400">
        Screensaver already has an image or video. Sending this file replaces that source. Duration, output size, audio, and encoder stay as they are. The picture is framed again, the same way as choosing a new image.
      </p>
      <template #actions>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.resolveSend('cancel')">Keep current</button>
        <button class="btn btn-primary cursor-pointer" type="button" @click="store.resolveSend('replace')">Replace</button>
      </template>
    </AppDialog>
  </div>
</template>
