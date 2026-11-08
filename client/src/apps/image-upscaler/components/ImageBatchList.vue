<script setup lang="ts">
import { formatBytes } from '@shared/imageUpscaler'
import { Download, Trash2 } from '@lucide/vue'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()

const statusLabel: Record<string, string> = {
  ready: 'Ready',
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
</script>

<template>
  <div v-if="store.items.length" class="space-y-2">
    <div class="flex justify-end">
      <button class="focus-ring cursor-pointer rounded-sm text-xs font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-40" type="button" :disabled="store.processing" @click="store.clearFiles()">
        Clear all
      </button>
    </div>
    <ul class="space-y-2">
      <li v-for="item in store.items" :key="item.localId">
        <div
          class="flex w-full items-center gap-2 rounded-lg border px-2 py-2"
          :class="item.localId === store.selectedId ? 'border-brand bg-brand/10' : 'border-zinc-800 bg-inset'"
        >
          <button class="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left" type="button" @click="store.selectItem(item.localId)">
            <img :src="item.previewUrl" alt="" class="h-12 w-12 shrink-0 rounded object-cover" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-zinc-100">{{ item.name }}</span>
              <span class="block text-xs text-zinc-500">{{ item.width }}×{{ item.height }} · {{ formatBytes(item.bytes) }}</span>
              <span class="block text-xs" :class="item.status === 'failed' ? 'text-red-300' : 'text-zinc-400'">
                {{ statusLabel[item.status] }}
                <template v-if="item.outputWidth && item.outputHeight"> · {{ item.outputWidth }}×{{ item.outputHeight }}</template>
              </span>
            </span>
          </button>
          <button
            v-if="item.status === 'completed'"
            class="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            type="button"
            aria-label="Download image"
            @click="store.downloadItem(item.localId)"
          >
            <Download :size="14" />
          </button>
          <button
            v-if="!store.processing"
            class="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
            type="button"
            aria-label="Remove image"
            @click="store.removeItem(item.localId)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <p v-if="item.error" class="mt-1 px-1 text-xs text-red-300">{{ item.error }}</p>
      </li>
    </ul>
  </div>
</template>
