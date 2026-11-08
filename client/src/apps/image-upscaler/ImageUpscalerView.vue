<script setup lang="ts">
import { Download, Sparkles, MonitorPlay } from '@lucide/vue'
import { computed } from 'vue'
import AppDialog from '../../components/ui/AppDialog.vue'
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
</script>

<template>
  <div class="relative grid h-full min-h-0 gap-3 overflow-y-auto p-3 lg:grid-cols-[300px_minmax(0,1fr)_360px] lg:grid-rows-1 lg:overflow-hidden">
    <aside class="studio-panel order-2 flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto p-4 lg:order-none lg:h-full lg:w-[300px] lg:max-w-[300px] lg:flex-none">
      <label class="block">
        <span class="section-label mb-1 block">Project</span>
        <input v-model="store.name" class="field text-sm font-semibold" type="text" maxlength="80" />
      </label>
      <div class="space-y-3">
        <p class="section-label">Images</p>
        <ImageUploader />
        <ImageBatchList />
      </div>
    </aside>

    <section class="studio-stage order-1 flex min-h-[320px] min-w-0 flex-col gap-3 p-3 lg:order-none lg:min-h-0 lg:overflow-y-auto">
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

    <aside class="studio-panel order-3 flex min-h-0 w-full flex-col lg:order-none lg:h-full lg:w-[360px] lg:max-w-[360px] lg:flex-none">
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
