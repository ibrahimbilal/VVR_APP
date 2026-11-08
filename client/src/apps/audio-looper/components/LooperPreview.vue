<script setup lang="ts">
import { computed } from 'vue'
import { formatHms } from '@shared/audioLooper'
import { formatBytes } from '../../../lib/format'
import AppPanel from '../../../components/ui/AppPanel.vue'
import { WAVEFORM_MAX_BYTES } from '../lib/waveform'
import { useAudioLooperStore } from '../stores/audioLooper'
import LooperPlayer from './LooperPlayer.vue'

const store = useAudioLooperStore()

const durationLabel = computed(() =>
  store.sourceDuration != null ? formatHms(Math.round(store.sourceDuration)) : '—',
)
const skippedWaveform = computed(() => (store.fileSize ?? 0) > WAVEFORM_MAX_BYTES)
</script>

<template>
  <div class="space-y-3">
    <AppPanel title="Source preview">
      <p class="truncate text-sm text-zinc-300">{{ store.fileName }}</p>
      <p class="mt-1 text-xs text-zinc-500">Source length: {{ durationLabel }}</p>
      <LooperPlayer class="mt-3" />
      <p v-if="skippedWaveform" class="mt-3 text-xs text-zinc-500">
        Waveform preview is skipped for large files so the browser does not decode them into memory.
      </p>
    </AppPanel>
    <AppPanel title="Loop plan" class="text-sm text-zinc-300">
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-zinc-400">
        <div>Source duration</div>
        <div class="text-zinc-200 tabular-nums">{{ store.sourceDuration != null ? formatHms(Math.round(store.sourceDuration)) : '—' }}</div>
        <div>Target duration</div>
        <div class="text-zinc-200 tabular-nums">{{ formatHms(store.targetDurationSeconds) }}</div>
        <div>Estimated repeats</div>
        <div class="text-zinc-200 tabular-nums">
          {{ store.sourceDuration ? store.estimatedRepeats.toFixed(store.estimatedRepeats % 1 ? 2 : 0) : '—' }}
        </div>
        <div>Approximate size</div>
        <div class="text-zinc-200">{{ formatBytes(store.estimatedBytes) }} (estimate)</div>
      </dl>
      <p v-if="store.willTrim" class="mt-3 text-xs text-amber-300">
        The source is longer than the target, so it will be trimmed rather than looped.
      </p>
      <p v-else-if="store.loopMode === 'seamless'" class="mt-3 text-xs text-zinc-500">
        Seamless mode equal-power crossfades adjacent repeats and starts at that wrap-around join. Ambient beds usually join smoothly; music and speech can still click.
      </p>
    </AppPanel>
  </div>
</template>
