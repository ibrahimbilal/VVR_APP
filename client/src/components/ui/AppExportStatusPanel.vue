<script setup lang="ts">
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from '@lucide/vue'
import { computed } from 'vue'

export type ExportStatusTone = 'active' | 'done' | 'error'

const props = withDefaults(
  defineProps<{
    open: boolean
    rows: { label: string; value: string }[]
    progress?: number | null
    tone?: ExportStatusTone
  }>(),
  {
    progress: null,
    tone: 'active',
  },
)

const emit = defineEmits<{
  toggle: []
}>()

const fraction = computed(() => {
  if (props.tone === 'done') return 1
  const value = props.progress
  if (value == null || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
})

const percentLabel = computed(() =>
  fraction.value == null ? null : `${Math.round(fraction.value * 100)}%`,
)

const barClass = computed(() => {
  if (props.tone === 'error') return 'bg-red-400'
  if (props.tone === 'done') return 'bg-emerald-400'
  return 'bg-brand'
})

const percentClass = computed(() => {
  if (props.tone === 'error') return 'text-red-300'
  if (props.tone === 'done') return 'text-emerald-300'
  return 'text-brand'
})
</script>

<template>
  <aside
    class="studio-panel flex min-h-0 shrink-0 flex-col overflow-hidden motion-safe:transition-[width,max-height] motion-safe:duration-200 motion-safe:ease-[var(--ease-out-soft)]"
    :class="
      open
        ? 'max-h-[32vh] w-full lg:h-full lg:max-h-none lg:w-[300px]'
        : 'h-12 w-full lg:h-full lg:w-12'
    "
    aria-label="Export status"
  >
    <button
      v-if="!open"
      class="focus-ring flex h-full w-full cursor-pointer items-center justify-center gap-2 px-3 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 lg:flex-col lg:px-1 lg:py-3"
      type="button"
      aria-expanded="false"
      aria-label="Expand export status"
      @click="emit('toggle')"
    >
      <ChevronUp class="lg:hidden" :size="16" />
      <ChevronLeft class="hidden lg:block" :size="16" />
      <span class="text-xs font-bold tracking-wide text-zinc-200 lg:[writing-mode:vertical-rl]">Export status</span>
      <span
        v-if="percentLabel"
        class="text-[11px] font-semibold tabular-nums text-brand lg:[writing-mode:vertical-rl]"
      >
        {{ percentLabel }}
      </span>
    </button>

    <template v-else>
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-4 pt-4 pb-3">
        <h2 class="text-sm font-bold text-zinc-100">Export status</h2>
        <div class="flex items-center gap-1">
          <span v-if="percentLabel" class="text-xs font-semibold tabular-nums" :class="percentClass">
            {{ percentLabel }}
          </span>
          <button
            class="focus-ring grid h-8 w-8 cursor-pointer place-items-center rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            type="button"
            aria-expanded="true"
            aria-label="Collapse export status"
            @click="emit('toggle')"
          >
            <ChevronDown class="lg:hidden" :size="16" />
            <ChevronRight class="hidden lg:block" :size="16" />
          </button>
        </div>
      </div>

      <div v-if="percentLabel" class="shrink-0 px-4 pt-3">
        <div class="h-1.5 overflow-hidden rounded-full bg-inset" aria-hidden="true">
          <div
            class="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-[var(--ease-out-soft)]"
            :class="barClass"
            :style="{ width: percentLabel }"
          />
        </div>
      </div>

      <dl class="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        <div
          v-for="row in rows"
          :key="row.label"
          class="flex items-start justify-between gap-4 border-b border-zinc-800/80 py-2.5 last:border-b-0"
        >
          <dt class="shrink-0 text-xs text-zinc-500">{{ row.label }}</dt>
          <dd class="min-w-0 text-right text-sm font-medium break-words text-zinc-100 tabular-nums">{{ row.value }}</dd>
        </div>
      </dl>
    </template>
  </aside>
</template>
