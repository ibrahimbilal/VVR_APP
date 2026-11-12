<script setup lang="ts">
import { computed } from 'vue'
import { formatHms } from '@shared/audioLooper'
import { formatBytes, formatClock } from '../../../lib/format'
import AppPanel from '../../../components/ui/AppPanel.vue'
import { WAVEFORM_MAX_BYTES } from '../lib/waveform'
import { useAudioLooperStore } from '../stores/audioLooper'
import LooperPlayer from './LooperPlayer.vue'
import LooperSequencePlayer from './LooperSequencePlayer.vue'

const store = useAudioLooperStore()
const selected = computed(() => store.selectedTrack)
const skippedWaveform = computed(() => (selected.value?.fileSize ?? 0) > WAVEFORM_MAX_BYTES)
const repeatsLabel = computed(() => {
  if (!store.sequencePeriod) return '—'
  const value = store.estimatedRepeats
  if (!Number.isFinite(value) || value <= 0) return '—'
  return value.toFixed(value % 1 ? 2 : 0)
})

function onTrimStart(event: Event): void {
  const track = selected.value
  if (!track?.duration) return
  const value = Number((event.target as HTMLInputElement).value)
  store.setTrim(track.id, value, track.trimEnd ?? track.duration)
}

function onTrimEnd(event: Event): void {
  const track = selected.value
  if (!track?.duration) return
  const value = Number((event.target as HTMLInputElement).value)
  store.setTrim(track.id, track.trimStart, value)
}
</script>

<template>
  <div class="space-y-3">
    <AppPanel v-if="store.trackCount >= 2" title="Sequence">
      <LooperSequencePlayer />
      <p v-if="store.playlistCrossfade && !store.settingsError" class="mt-3 text-xs text-zinc-500">
        Preview overlaps tracks by the same crossfade length, including the return to the first track. The exported file starts on that join.
      </p>
      <p v-if="store.normalizeLoudness" class="mt-2 text-xs text-zinc-500">
        Loudness matching is applied during export, not in this browser preview. It aims for -16 LUFS with a -1.5 dBTP true-peak limit. It does not make every track sound identical.
      </p>
      <div v-if="store.normalizeLoudness" class="mt-3 flex flex-wrap items-center gap-2">
        <button
          class="btn btn-ghost cursor-pointer text-xs"
          type="button"
          :disabled="store.mixPreviewState === 'running' || Boolean(store.settingsError)"
          @click="store.previewMix()"
        >
          {{ store.mixPreviewState === 'running' ? 'Preparing mix…' : 'Preview mix' }}
        </button>
        <button
          v-if="store.mixPreviewUrl"
          class="btn btn-ghost cursor-pointer text-xs"
          type="button"
          @click="store.clearMixPreview()"
        >
          Close mix
        </button>
      </div>
      <p v-if="store.mixPreviewError" class="mt-2 text-xs text-red-300">{{ store.mixPreviewError }}</p>
    </AppPanel>

    <AppPanel :title="store.trackCount >= 2 ? 'Selected track' : 'Source preview'">
      <p class="truncate text-sm text-zinc-300">{{ selected ? store.displayName(selected) : store.fileName }}</p>
      <p class="mt-1 text-xs text-zinc-500">
        Trimmed length:
        {{ selected && store.trimmedLength(selected) > 0 ? formatClock(store.trimmedLength(selected)) : '—' }}
      </p>
      <LooperPlayer class="mt-3" />
      <div v-if="selected?.duration" class="mt-3 grid grid-cols-2 gap-2">
        <label class="block text-xs text-zinc-500">
          Start
          <input
            class="field mt-1 tabular-nums"
            type="number"
            min="0"
            :max="selected.duration"
            step="0.1"
            :value="selected.trimStart.toFixed(2)"
            @change="onTrimStart"
          />
        </label>
        <label class="block text-xs text-zinc-500">
          End
          <input
            class="field mt-1 tabular-nums"
            type="number"
            min="0"
            :max="selected.duration"
            step="0.1"
            :value="(selected.trimEnd ?? selected.duration).toFixed(2)"
            @change="onTrimEnd"
          />
        </label>
      </div>
      <button
        v-if="selected?.duration && (selected.trimStart > 0.01 || (selected.trimEnd ?? selected.duration) < selected.duration - 0.01)"
        class="btn btn-ghost mt-2 cursor-pointer text-xs"
        type="button"
        @click="store.resetTrim(selected.id)"
      >
        Reset trim
      </button>
      <p v-if="skippedWaveform" class="mt-3 text-xs text-zinc-500">
        Waveform preview is skipped for large files so the browser does not decode them into memory.
      </p>
    </AppPanel>

    <AppPanel title="Loop plan" class="text-sm text-zinc-300">
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-zinc-400">
        <div>{{ store.trackCount >= 2 ? 'Sequence duration' : 'Source duration' }}</div>
        <div class="text-zinc-200 tabular-nums">{{ store.sequencePeriod > 0 ? formatHms(Math.round(store.sequencePeriod)) : '—' }}</div>
        <div>Target duration</div>
        <div class="text-zinc-200 tabular-nums">{{ formatHms(store.targetDurationSeconds) }}</div>
        <div>Estimated repeats</div>
        <div class="text-zinc-200 tabular-nums">{{ repeatsLabel }}</div>
        <div>Approximate size</div>
        <div class="text-zinc-200">{{ formatBytes(store.estimatedBytes) }} (estimate)</div>
      </dl>
      <p v-if="store.settingsError" class="mt-3 text-xs text-amber-300">{{ store.settingsError }}</p>
      <p v-else-if="store.willTrim" class="mt-3 text-xs text-amber-300">
        The sequence is longer than the target, so the export stops at the target instead of looping.
      </p>
      <p v-else-if="store.trackCount < 2 && store.loopMode === 'seamless'" class="mt-3 text-xs text-zinc-500">
        Seamless mode equal-power crossfades adjacent repeats and starts at that wrap-around join. Ambient beds usually join smoothly; music and speech can still click.
      </p>
      <p v-else-if="store.trackCount >= 2 && store.playlistCrossfade" class="mt-3 text-xs text-zinc-500">
        Each join overlaps, including the pass from the last track back to the first. Repeats fill the target and stop on time.
      </p>
    </AppPanel>
  </div>
</template>
