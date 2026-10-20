<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

defineProps<{ title: string; open?: boolean }>()
</script>

<template>
  <details class="group border-b border-zinc-800 last:border-b-0" :open="open">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
      <span>{{ title }}</span>
      <ChevronDown class="shrink-0 text-zinc-500 transition group-open:rotate-180" :size="16" />
    </summary>
    <div class="space-y-3 px-4 pb-4">
      <slot />
    </div>
  </details>
</template>
