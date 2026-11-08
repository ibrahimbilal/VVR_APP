<script setup lang="ts">
import { ref } from 'vue'
import { AUDIO_LOOPER_BITRATES, AUDIO_LOOPER_FORMATS, type AudioLooperFormat, type AudioLooperLoopMode } from '@shared/audioLooper'
import { useAudioLooperStore } from '../stores/audioLooper'

const store = useAudioLooperStore()
const customMinutes = ref(60)
const inspector = ref<'duration' | 'loop' | 'output'>('duration')

function onCustomMinutes(): void {
  store.setCustomDurationMinutes(customMinutes.value)
}

function setMode(mode: AudioLooperLoopMode): void {
  store.setLoopMode(mode)
}

function setFormat(value: string): void {
  store.format = value as AudioLooperFormat
}

function setBitrate(value: string): void {
  store.mp3Bitrate = Number(value) as (typeof AUDIO_LOOPER_BITRATES)[number]
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 border-b border-zinc-800">
      <h2 class="px-4 pt-4 text-sm font-bold text-zinc-100">Settings</h2>
      <div class="grid grid-cols-3 gap-1 px-3 py-3" role="tablist">
        <button class="btn cursor-pointer px-1 text-xs" :class="inspector === 'duration' ? 'btn-primary' : 'btn-ghost'" type="button" role="tab" :aria-selected="inspector === 'duration'" @click="inspector = 'duration'">Duration</button>
        <button class="btn cursor-pointer px-1 text-xs" :class="inspector === 'loop' ? 'btn-primary' : 'btn-ghost'" type="button" role="tab" :aria-selected="inspector === 'loop'" @click="inspector = 'loop'">Loop</button>
        <button class="btn cursor-pointer px-1 text-xs" :class="inspector === 'output' ? 'btn-primary' : 'btn-ghost'" type="button" role="tab" :aria-selected="inspector === 'output'" @click="inspector = 'output'">Output</button>
      </div>
    </div>
    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">

    <div v-show="inspector === 'duration'" class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="preset in store.presets"
          :key="preset.seconds"
          class="btn cursor-pointer text-xs"
          :class="store.durationPresetKey === String(preset.seconds) ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="store.setDurationPreset(preset.seconds)"
        >
          {{ preset.label }}
        </button>
      </div>
      <div class="space-y-1">
        <label class="text-xs text-zinc-500">Custom (minutes)</label>
        <div class="flex gap-2">
          <input v-model.number="customMinutes" class="field flex-1" type="number" min="5" max="600" step="1" />
          <button class="btn btn-ghost cursor-pointer" type="button" @click="onCustomMinutes">Apply</button>
        </div>
        <p class="text-xs text-zinc-500">Output: {{ store.durationLabel }}</p>
      </div>
    </div>

    <div v-show="inspector === 'loop'" class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <button class="btn cursor-pointer text-xs" :class="store.loopMode === 'simple' ? 'btn-primary' : 'btn-ghost'" type="button" @click="setMode('simple')">Simple</button>
        <button class="btn cursor-pointer text-xs" :class="store.loopMode === 'seamless' ? 'btn-primary' : 'btn-ghost'" type="button" :disabled="!store.seamlessAvailable" @click="setMode('seamless')">Seamless</button>
      </div>
      <p v-if="!store.seamlessAvailable" class="text-xs text-zinc-500">Seamless crossfade is not available on this build.</p>
      <p v-else class="text-xs text-zinc-500">Simple repeats the file. Seamless overlaps each join with an equal-power crossfade.</p>
      <label v-if="store.loopMode === 'seamless'" class="block">
        <span class="mb-1 flex justify-between text-xs text-zinc-500">
          <span>Crossfade</span>
          <span class="tabular-nums text-zinc-300">{{ store.crossfadeSeconds.toFixed(2) }}s</span>
        </span>
        <input class="w-full accent-brand" type="range" min="0.01" :max="store.maxCrossfade" step="0.01" :value="store.crossfadeSeconds" @input="store.crossfadeSeconds = Number(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="block">
        <span class="mb-1 flex justify-between text-xs text-zinc-500">
          <span>Fade in</span>
          <span class="tabular-nums text-zinc-300">{{ store.fadeInSeconds.toFixed(1) }}s</span>
        </span>
        <input class="w-full accent-brand" type="range" min="0" max="30" step="0.1" :value="store.fadeInSeconds" @input="store.fadeInSeconds = Number(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="block">
        <span class="mb-1 flex justify-between text-xs text-zinc-500">
          <span>Fade out</span>
          <span class="tabular-nums text-zinc-300">{{ store.fadeOutSeconds.toFixed(1) }}s</span>
        </span>
        <input class="w-full accent-brand" type="range" min="0" max="30" step="0.1" :value="store.fadeOutSeconds" @input="store.fadeOutSeconds = Number(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="block">
        <span class="mb-1 flex justify-between text-xs text-zinc-500">
          <span>Volume</span>
          <span class="tabular-nums text-zinc-300">{{ Math.round(store.volumePercent) }}%</span>
        </span>
        <input class="w-full accent-brand" type="range" min="0" max="200" step="1" :value="store.volumePercent" @input="store.volumePercent = Number(($event.target as HTMLInputElement).value)" />
      </label>
    </div>

    <div v-show="inspector === 'output'" class="space-y-3">
      <label class="block">
        <span class="mb-1 block text-xs text-zinc-500">Format</span>
        <select class="field" :value="store.format" @change="setFormat(($event.target as HTMLSelectElement).value)">
          <option v-for="item in AUDIO_LOOPER_FORMATS" :key="item" :value="item">{{ item.toUpperCase() }}</option>
        </select>
      </label>
      <label v-if="store.format === 'mp3'" class="block">
        <span class="mb-1 block text-xs text-zinc-500">MP3 bitrate</span>
        <select class="field" :value="store.mp3Bitrate" @change="setBitrate(($event.target as HTMLSelectElement).value)">
          <option v-for="rate in AUDIO_LOOPER_BITRATES" :key="rate" :value="rate">{{ rate }} kbps</option>
        </select>
      </label>
      <p v-else-if="store.format === 'wav'" class="text-xs text-zinc-500">WAV is PCM 16-bit at the source sample rate.</p>
      <p v-else class="text-xs text-zinc-500">FLAC is lossless at the source sample rate.</p>
    </div>
    </div>
  </div>
</template>
