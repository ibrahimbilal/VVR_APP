<script setup lang="ts">
import { formatBytes } from '@shared/imageUpscaler'
import { Download, Trash2 } from '@lucide/vue'
import { ref } from 'vue'
import AppDialog from '../../../components/ui/AppDialog.vue'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
const deleteAllOpen = ref(false)

const statusLabel: Record<string, string> = {
  ready: 'Ready',
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function statusClass(status: string): string {
  switch (status) {
    case 'processing':
      return 'bg-brand/15 text-brand'
    case 'pending':
      return 'bg-amber-400/15 text-amber-200'
    case 'completed':
      return 'bg-emerald-400/15 text-emerald-200'
    case 'failed':
      return 'bg-red-400/15 text-red-200'
    case 'cancelled':
      return 'bg-zinc-700/80 text-zinc-300'
    default:
      return 'bg-zinc-800 text-zinc-300'
  }
}

function downloaded(item: { status: string; downloadedRevision: number | null; outputRevision: number | null }): boolean {
  return item.status === 'completed' && item.downloadedRevision != null && item.downloadedRevision === item.outputRevision
}

function closeDeleteAll() {
  deleteAllOpen.value = false
}

async function confirmDeleteAll() {
  deleteAllOpen.value = false
  await store.clearFiles()
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
      <h3 class="section-label">Images</h3>
      <button
        class="btn btn-ghost cursor-pointer px-2 py-1 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        :disabled="store.items.length === 0 || store.processing"
        @click="deleteAllOpen = true"
      >
        <Trash2 :size="14" />
        Delete all
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
      <p v-if="store.items.length === 0" class="px-2 py-8 text-center text-sm text-zinc-500">
        Drop PNG, JPEG, or WebP files above. Upscale stays off until there is at least one image.
      </p>

      <article
        v-for="item in store.items"
        :key="item.localId"
        class="cursor-pointer rounded-lg border bg-inset p-2 transition-opacity"
        :class="[
          item.localId === store.selectedId ? 'border-zinc-200' : 'border-zinc-800',
          downloaded(item) ? 'opacity-50' : 'opacity-100',
        ]"
        :aria-current="item.localId === store.selectedId ? 'true' : undefined"
        @click="store.selectItem(item.localId)"
      >
        <div class="flex gap-2">
          <div class="h-14 w-14 shrink-0 overflow-hidden rounded bg-zinc-900">
            <img :src="item.previewUrl" alt="" class="h-full w-full object-cover" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-2">
              <p class="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100" :title="item.name">{{ item.name }}</p>
              <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" :class="statusClass(item.status)">
                {{ statusLabel[item.status] }}
              </span>
            </div>
            <p class="mt-0.5 truncate text-xs text-zinc-500">
              {{ item.width }}×{{ item.height }} · {{ formatBytes(item.bytes) }}
              <template v-if="item.outputWidth && item.outputHeight"> · {{ item.outputWidth }}×{{ item.outputHeight }}</template>
            </p>
          </div>
        </div>

        <p v-if="item.error" class="mt-2 text-xs text-red-300">{{ item.error }}</p>

        <div class="mt-2 flex" @click.stop>
          <button
            v-if="item.status === 'completed'"
            class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            type="button"
            aria-label="Download image"
            title="Download"
            @click="store.downloadItem(item.localId)"
          >
            <Download :size="16" />
          </button>
          <button
            class="ml-auto rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-red-300 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            aria-label="Remove image"
            title="Remove"
            :disabled="store.processing"
            @click="store.removeItem(item.localId)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </article>
    </div>

    <div class="shrink-0 border-t border-zinc-800 p-3">
      <button
        class="btn btn-ghost w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        :disabled="store.completedCount === 0"
        @click="store.downloadZip()"
      >
        <Download :size="16" />
        Download all
      </button>
    </div>

    <AppDialog :open="deleteAllOpen" title="Delete all images" @cancel="closeDeleteAll">
      <p class="text-sm text-zinc-300">Remove every image from this list?</p>
      <template #actions>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="closeDeleteAll">Cancel</button>
        <button class="btn btn-danger cursor-pointer" type="button" @click="confirmDeleteAll">Delete all</button>
      </template>
    </AppDialog>
  </section>
</template>
