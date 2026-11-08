<script setup lang="ts">
import { AlertCircle, Check, Loader2, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { FILE_STATUS_DEFAULT_LABELS, type FileStatusBoxStatus } from '../lib/fileStatusBox'

export type { FileStatusBoxStatus }

const props = withDefaults(
  defineProps<{
    fileName: string
    status?: FileStatusBoxStatus
    /** Overrides the default label for the current status. */
    statusLabel?: string | null
    removeLabel?: string
    removable?: boolean
  }>(),
  {
    status: 'ready',
    statusLabel: null,
    removeLabel: 'Remove file',
    removable: true,
  },
)

const emit = defineEmits<{
  remove: []
}>()

const DEFAULT_LABELS = FILE_STATUS_DEFAULT_LABELS

const theme = computed(() => {
  switch (props.status) {
    case 'uploading':
      return {
        box: 'border-brand/40 bg-brand/10',
        label: 'text-brand',
        icon: 'text-brand',
      }
    case 'error':
      return {
        box: 'border-red-500/35 bg-red-500/10',
        label: 'text-red-300',
        icon: 'text-red-300',
      }
    case 'processing':
      return {
        box: 'border-amber-500/35 bg-amber-500/10',
        label: 'text-amber-300',
        icon: 'text-amber-300',
      }
    default:
      return {
        box: 'border-emerald-500/35 bg-emerald-500/10',
        label: 'text-emerald-400',
        icon: 'text-emerald-400',
      }
  }
})

const labelText = computed(() => props.statusLabel ?? DEFAULT_LABELS[props.status])

const spinIcon = computed(() => props.status === 'uploading' || props.status === 'processing')
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-lg border px-3 py-2.5"
    :class="theme.box"
    role="status"
    :aria-live="status === 'uploading' || status === 'processing' ? 'polite' : undefined"
  >
    <Loader2 v-if="spinIcon" :size="16" class="shrink-0 animate-spin" :class="theme.icon" aria-hidden="true" />
    <AlertCircle v-else-if="status === 'error'" :size="16" class="shrink-0" :class="theme.icon" aria-hidden="true" />
    <Check v-else :size="16" class="shrink-0" :class="theme.icon" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-xs font-semibold uppercase tracking-[0.12em]" :class="theme.label">{{ labelText }}</p>
      <p class="truncate text-sm font-semibold text-zinc-100" :title="fileName">{{ fileName }}</p>
      <div v-if="$slots.meta" class="mt-0.5 text-xs text-zinc-500">
        <slot name="meta" />
      </div>
    </div>
    <button
      v-if="removable"
      class="btn btn-ghost shrink-0 cursor-pointer px-2 py-1"
      type="button"
      :aria-label="removeLabel"
      :title="removeLabel"
      @click="emit('remove')"
    >
      <Trash2 :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
