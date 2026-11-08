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
  <div class="relative flex h-full min-h-0 min-w-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
    <aside class="shrink-0 space-y-3 border-b border-zinc-800 p-4 lg:h-full lg:w-[320px] lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div>
        <h2 class="text-sm font-bold text-zinc-100">Image Upscaler</h2>
        <p class="mt-1 text-xs leading-relaxed text-zinc-500">
          Standard mode resizes with Lanczos3. AI Lite, when this server has it, reconstructs edges and texture and can change fine detail.
        </p>
      </div>
      <ImageUploader />
      <ImageBatchList />
    </aside>

    <section class="flex min-h-[320px] shrink-0 flex-col gap-3 p-4 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
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

    <aside class="shrink-0 border-t border-zinc-800 p-4 lg:h-full lg:w-[320px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
      <UpscaleSettings />
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-primary cursor-pointer" type="button" :disabled="store.items.length === 0 || store.processing" @click="store.upscale()">
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
