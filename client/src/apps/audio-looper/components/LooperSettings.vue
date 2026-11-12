<script setup lang="ts">
import { ref } from 'vue'
import { AUDIO_LOOPER_BITRATES, AUDIO_LOOPER_FORMATS, type AudioLooperFormat, type AudioLooperLoopMode } from '@shared/audioLooper'
import ToggleSwitch from '../../../components/ToggleSwitch.vue'
import AppSettingsTabs from '../../../components/ui/AppSettingsTabs.vue'
import { useAudioLooperStore } from '../stores/audioLooper'

const store = useAudioLooperStore()
const customMinutes = ref(60)
const inspector = ref<'duration' | 'loop' | 'output'>('duration')
const inspectorTabs = [
  { id: 'duration' as const, label: 'Duration' },
  { id: 'loop' as const, label: 'Loop' },
  { id: 'output' as const, label: 'Output' },
]

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
      <AppSettingsTabs v-model="inspector" :items="inspectorTabs" />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <Transition name="settings-pane" mode="out-in">
        <div v-if="inspector === 'duration'" key="duration" class="space-y-3">
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
        <div v-else-if="inspector === 'loop'" key="loop" class="space-y-3">
          <p v-if="!store.hasSource" class="text-xs text-zinc-500">Add audio to configure the loop.</p>
          <template v-else-if="store.trackCount >= 2">
            <div class="flex flex-wrap gap-2">
              <button class="btn btn-ghost cursor-pointer text-xs" type="button" @click="store.shuffleTracks()">
                {{ store.shuffled ? 'Reshuffle' : 'Shuffle' }}
              </button>
              <button v-if="store.shuffled" class="btn btn-ghost cursor-pointer text-xs" type="button" @click="store.restoreOrder()">
                Restore order
              </button>
            </div>
            <p class="text-xs text-zinc-500">Shuffle changes the order you see, preview, and export. It stays fixed once an export starts.</p>
            <div class="flex items-center justify-between gap-3 text-sm text-zinc-200">
              <span title="Overlaps the end of each track with the start of the next, including the loop back to the first track.">Crossfade</span>
              <ToggleSwitch
                :model-value="store.playlistCrossfade"
                :disabled="store.readyTracks.length >= 2 && store.playlistLimit < 0.05"
                aria-label="Crossfade"
                @update:model-value="store.setPlaylistCrossfade"
              />
            </div>
            <p v-if="store.readyTracks.length >= 2 && store.playlistLimit < 0.05" class="text-xs text-amber-300">
              These tracks are too short for a crossfade.
            </p>
            <label v-if="store.playlistCrossfade" class="block">
              <span class="mb-1 flex justify-between text-xs text-zinc-500">
                <span>Transition</span>
                <span class="tabular-nums text-zinc-300">{{ store.playlistCrossfadeSeconds.toFixed(2) }}s</span>
              </span>
              <input
                class="w-full accent-brand"
                type="range"
                min="0.05"
                :max="Math.max(0.05, store.playlistLimit || 3)"
                step="0.05"
                :value="store.playlistCrossfadeSeconds"
                @input="store.playlistCrossfadeSeconds = Number(($event.target as HTMLInputElement).value)"
              />
              <p class="mt-1 text-xs text-zinc-500">Default is 3 seconds. The longest allowed fade is half the shortest join, including the return to the first track.</p>
            </label>
            <div class="flex items-center justify-between gap-3 text-sm text-zinc-200">
              <span title="Two-pass loudness matching toward -16 LUFS with a -1.5 dBTP peak limit. Tracks can still sound different.">Match loudness</span>
              <ToggleSwitch v-model="store.normalizeLoudness" aria-label="Match loudness" />
            </div>
            <p v-if="store.settingsError" class="text-xs text-amber-300">{{ store.settingsError }}</p>
          </template>
          <template v-else>
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
          </template>
          <template v-if="store.hasSource">
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
          </template>
        </div>
        <div v-else key="output" class="space-y-3">
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
      </Transition>
    </div>
  </div>
</template>
