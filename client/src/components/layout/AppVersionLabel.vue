<script setup lang="ts">
import { formatAppVersion } from '../../lib/appVersion'

withDefaults(
  defineProps<{
    /** Show product name above the version (mobile drawer). */
    showBrand?: boolean
    compact?: boolean
  }>(),
  { showBrand: false, compact: false },
)

const versionLabel = formatAppVersion()
</script>

<template>
  <div
    class="select-none text-center text-zinc-500"
    :class="compact ? 'px-1 py-1' : 'px-3 py-2'"
    :title="`Ribo Studio ${versionLabel}`"
  >
    <p v-if="showBrand" class="truncate text-[10px] font-semibold tracking-wide text-zinc-400">Ribo Studio</p>
    <p class="font-mono tabular-nums leading-none" :class="compact ? 'text-[9px]' : 'mt-0.5 text-[11px]'">
      {{ versionLabel }}
    </p>
  </div>
</template>
