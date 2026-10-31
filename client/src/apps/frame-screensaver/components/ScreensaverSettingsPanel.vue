<script setup lang="ts">
import { computed } from 'vue'
import { Eye, RotateCcw, SquareSplitHorizontal, Trash2 } from '@lucide/vue'
import { ADJUSTMENT_FIELDS } from '@shared/screensaverAdjust'
import { FRAME_FILE_LIMIT } from '@shared/screensaverFrames'
import { DURATION_PRESETS, SCREENSAVER_FPS, SCREENSAVER_OUTPUTS } from '@shared/screensaver'
import AdvancedAudioControls from '../../../components/audio/AdvancedAudioControls.vue'
import AudioFileField from '../../../components/audio/AudioFileField.vue'
import FileDropZone from '../../../components/FileDropZone.vue'
import SettingsAccordion from '../../../components/SettingsAccordion.vue'
import SliderField from '../../../components/SliderField.vue'
import { webGl2Available } from '../lib/render/createScreensaverRenderer'
import type { PreviewRendererMode } from '../lib/previewRendererPreference'
import { useScreensaverStore } from '../stores/screensaver'
import { DEFAULT_FRAMES } from '../lib/defaultFrames'

const store = useScreensaverStore()

const previewRendererActiveLabel = computed(() => {
  if (store.previewRendererActive === 'webgl2') return 'GPU (WebGL2)'
  if (store.previewRendererActive === 'canvas2d') return 'CPU (Canvas 2D)'
  return 'not active'
})

const customMinutes = defineModel<number>('customMinutes', { default: 60 })
const frameLimitMb = FRAME_FILE_LIMIT / (1024 * 1024)

function onFrameFiles(files: File[]) {
  if (files.length > 0) void store.uploadFrames(files)
}

function onAudioFiles(files: File[]) {
  const file = files[0]
  if (file) void store.setAudioFile(file)
}

const hardwareEncoders = computed(() => store.encoderOptions.filter((item) => item.hardware && item.listed))
const selectedEncoder = computed(() => store.encoderOptions.find((item) => item.id === store.encoder))
const autoLabel = computed(() => {
  const name = store.mode === 'static' ? store.autoStill : store.autoMotion
  return name ? ` — ${name}` : ''
})

function setPixel(key: 'x' | 'y' | 'width' | 'height', event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  const next = { ...store.composition }
  if (key === 'x') next.x = value / store.outputWidth
  if (key === 'y') next.y = value / store.outputHeight
  if (key === 'width') next.width = value / store.outputWidth
  if (key === 'height') next.height = value / store.outputHeight
  store.replaceComposition(next)
  store.commitComposition()
}

function setNumber(key: 'rotation', event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  store.replaceComposition({ ...store.composition, [key]: value })
  store.commitComposition()
}

function setOpacity(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  store.replaceComposition({ ...store.composition, opacity: value / 100 })
  store.commitComposition()
}

function toggleFlip(key: 'flipH' | 'flipV') {
  store.replaceComposition({ ...store.composition, [key]: !store.composition[key] })
  store.commitComposition()
}

function resetOne(key: (typeof ADJUSTMENT_FIELDS)[number]['key']) {
  store.composition.adjustments[key] = 0
  store.commitComposition()
}

function onCustomMinutes() {
  store.setCustomDurationMinutes(customMinutes.value)
}
</script>

<template>
  <div class="space-y-4">
    <SettingsAccordion title="Frames" :open="true">
      <div v-if="DEFAULT_FRAMES.length > 0" class="grid grid-cols-2 gap-2">
        <button
          v-for="frame in DEFAULT_FRAMES"
          :key="frame.id"
          class="block w-full cursor-pointer overflow-hidden rounded-md border bg-[#101114]"
          :class="store.composition.frameId === frame.id ? 'border-amber-300 ring-1 ring-amber-300' : 'border-zinc-700 hover:border-zinc-500'"
          type="button"
          :aria-pressed="store.composition.frameId === frame.id"
          :title="frame.name"
          @click="store.selectFrame(frame.id)"
        >
          <img
            :src="frame.thumbUrl"
            :alt="frame.name"
            width="150"
            loading="lazy"
            decoding="async"
            class="aspect-video w-full object-contain"
          />
        </button>
      </div>
      <FileDropZone
        class="mt-3"
        compact
        accept="image/png,.png"
        multiple
        :disabled="store.frameUploading"
        label="Upload PNG frames"
        drop-label="Drop PNG frames"
        busy-label="Uploading…"
        :hint="`PNG only, up to ${frameLimitMb} MB`"
        @files="onFrameFiles"
      />
      <p v-if="store.frames.length === 0" class="mt-2 text-xs text-zinc-500">
        Choose a frame above or upload your own PNG. Click a frame to place it over the picture. Click it again to clear it.
      </p>
      <div v-else class="mt-3 grid grid-cols-2 gap-2">
        <div v-for="frame in store.frames" :key="frame.id" class="relative">
          <button
            class="block w-full cursor-pointer overflow-hidden rounded-md border bg-[#101114]"
            :class="store.composition.frameId === frame.id ? 'border-amber-300 ring-1 ring-amber-300' : 'border-zinc-700 hover:border-zinc-500'"
            type="button"
            :aria-pressed="store.composition.frameId === frame.id"
            :title="frame.name"
            @click="store.selectFrame(frame.id)"
          >
            <img :src="`/api/screensaver/frames/${frame.id}`" :alt="frame.name" class="aspect-video w-full object-contain" />
          </button>
          <button
            class="absolute top-1 right-1 cursor-pointer rounded bg-black/70 p-1 text-zinc-200 hover:text-white"
            type="button"
            :aria-label="`Remove ${frame.name}`"
            :title="`Remove ${frame.name}`"
            @click="store.removeFrame(frame.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
    </SettingsAccordion>

    <SettingsAccordion title="Duration" :open="true">
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="preset in DURATION_PRESETS"
          :key="preset.seconds"
          class="btn cursor-pointer text-xs"
          :class="store.durationPresetKey === String(preset.seconds) ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="store.setDurationPreset(String(preset.seconds), preset.seconds)"
        >
          {{ preset.label }}
        </button>
      </div>
      <div class="mt-3 space-y-1">
        <label class="text-xs text-zinc-500">Custom (minutes)</label>
        <div class="flex gap-2">
          <input v-model.number="customMinutes" class="field flex-1" type="number" min="5" max="600" step="1" />
          <button class="btn btn-ghost cursor-pointer" type="button" @click="onCustomMinutes">Apply</button>
        </div>
        <p class="text-xs text-zinc-500">Output: {{ store.durationLabel }}</p>
      </div>
    </SettingsAccordion>

    <SettingsAccordion title="Output" :open="false">
      <label class="text-xs text-zinc-500">Resolution</label>
      <select
        class="field mt-1"
        :value="`${store.outputWidth}x${store.outputHeight}`"
        @change="
          (e) => {
            const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number)
            store.setResolution(w, h)
          }
        "
      >
        <option v-for="output in SCREENSAVER_OUTPUTS" :key="output.label" :value="`${output.width}x${output.height}`">
          {{ output.label }}
        </option>
      </select>
      <label class="mt-3 block text-xs text-zinc-500">Profile</label>
      <select class="field mt-1" :value="store.profile" @change="store.setProfile(($event.target as HTMLSelectElement).value as never)">
        <option v-for="item in store.SCREENSAVER_PROFILES" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select>
      <p class="mt-1 text-xs text-zinc-500">{{ store.SCREENSAVER_PROFILES.find((item) => item.id === store.profile)?.detail }}</p>
      <label class="mt-3 block text-xs text-zinc-500">Frame rate</label>
      <select v-model.number="store.fps" class="field mt-1">
        <option v-for="rate in SCREENSAVER_FPS" :key="rate" :value="rate">{{ rate }} fps</option>
      </select>
      <p class="mt-1 text-xs text-zinc-500">Static Art defaults to 1 fps. 60 fps encodes more data and takes longer.</p>
      <label class="mt-3 block text-xs text-zinc-500">Preview rendering</label>
      <select
        class="field mt-1"
        :value="store.previewRenderer"
        @change="store.setPreviewRenderer(($event.target as HTMLSelectElement).value as PreviewRendererMode)"
      >
        <option value="auto">Auto (GPU when available)</option>
        <option value="webgl2" :disabled="!webGl2Available()">GPU (WebGL2)</option>
        <option value="canvas2d">CPU (Canvas 2D)</option>
      </select>
      <p class="mt-1 text-xs text-zinc-500">
        Active: {{ previewRendererActiveLabel }}.
        <span v-if="store.previewRenderer === 'webgl2' && store.previewRendererActive === 'canvas2d'">WebGL could not start; using CPU.</span>
      </p>
      <label class="mt-3 block text-xs text-zinc-500">Encoding method</label>
      <select v-model="store.encoder" class="field mt-1">
        <option value="auto">Auto (recommended){{ autoLabel }}</option>
        <option value="cpu">CPU</option>
        <option v-for="item in hardwareEncoders" :key="item.id" :value="item.id" :disabled="!item.verified">
          {{ item.label }}{{ item.verified ? '' : ' — unavailable' }}
        </option>
      </select>
      <p v-if="selectedEncoder && !selectedEncoder.verified" class="mt-1 text-xs text-amber-200">{{ selectedEncoder.detail }}</p>
      <label class="mt-3 block text-xs text-zinc-500">Fit</label>
      <select class="field mt-1" :value="store.fit" @change="store.setFit(($event.target as HTMLSelectElement).value as 'contain' | 'cover' | 'blur')">
        <option value="contain">Contain</option>
        <option value="cover">Cover</option>
        <option value="blur">Blurred background</option>
      </select>
    </SettingsAccordion>

    <SettingsAccordion title="Adjustments">
      <div
        @pointerdown="store.setPreviewInteracting(true)"
        @pointerup="store.setPreviewInteracting(false)"
        @pointerleave="store.setPreviewInteracting(false)"
        @pointercancel="store.setPreviewInteracting(false)"
      >
      <div class="mb-2 flex gap-2">
        <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Reset all" title="Reset all" @click="store.resetAdjustments()">
          <RotateCcw :size="16" />
        </button>
        <button
          class="btn cursor-pointer px-2 py-1"
          :class="store.compareAdjustments ? 'btn-primary' : 'btn-ghost'"
          type="button"
          :aria-label="store.compareAdjustments ? 'Showing original' : 'Before / after'"
          :title="store.compareAdjustments ? 'Showing original' : 'Before / after'"
          @click="store.compareAdjustments = !store.compareAdjustments"
        >
          <Eye v-if="store.compareAdjustments" :size="16" />
          <SquareSplitHorizontal v-else :size="16" />
        </button>
      </div>
      <div v-for="field in ADJUSTMENT_FIELDS" :key="field.key" class="flex items-center gap-2">
        <SliderField
          class="flex-1"
          :label="field.label"
          :min="field.min"
          :max="field.max"
          :step="1"
          :model-value="store.composition.adjustments[field.key]"
          @update:model-value="(value) => (store.composition.adjustments[field.key] = value)"
          @change="store.commitComposition()"
        />
        <button class="btn btn-ghost mt-4 shrink-0 cursor-pointer px-2 py-1" type="button" :aria-label="`Reset ${field.label}`" :title="`Reset ${field.label}`" @click="resetOne(field.key)">
          <RotateCcw :size="16" />
        </button>
      </div>
      </div>
    </SettingsAccordion>

    <SettingsAccordion title="Background">
      <select v-model="store.composition.background.mode" class="field" @change="store.commitComposition()">
        <option value="color">Custom color</option>
        <option value="black">Black</option>
        <option value="white">White</option>
        <option value="blur">Blurred image</option>
        <option value="transparent">Transparent in the editor</option>
      </select>
      <label v-if="store.composition.background.mode === 'color' || store.composition.background.mode === 'transparent'" class="mt-2 block text-xs text-zinc-500">
        Color
        <input v-model="store.composition.background.color" class="mt-1" type="color" @change="store.backgroundColor = store.composition.background.color; store.commitComposition()" />
      </label>
      <SliderField
        v-if="store.composition.background.mode === 'blur'"
        class="mt-2"
        label="Blur strength"
        :min="0"
        :max="100"
        :step="1"
        :model-value="store.composition.background.blur"
        @update:model-value="(value) => (store.composition.background.blur = value)"
        @change="store.commitComposition()"
      />
      <p class="text-xs text-zinc-500">MP4 files flatten transparency onto this color.</p>
    </SettingsAccordion>

    <SettingsAccordion title="Mode" :open="false">
      <div class="space-y-2">
        <label class="flex cursor-pointer items-center gap-2 text-sm">
          <input v-model="store.mode" type="radio" value="static" />
          Static art (image)
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm">
          <input v-model="store.mode" type="radio" value="loop" />
          Looping video
        </label>
      </div>
    </SettingsAccordion>

    <SettingsAccordion v-if="store.mode === 'loop'" title="Loop">
      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input v-model="store.loopType" type="radio" value="hard" />
        Hard loop
      </label>
      <label class="mt-2 flex cursor-pointer items-center gap-2 text-sm">
        <input v-model="store.loopType" type="radio" value="smooth" />
        Smooth loop (crossfade when possible)
      </label>
      <SliderField
        v-if="store.loopType === 'smooth'"
        class="mt-3"
        label="Crossfade (seconds)"
        :min="0.25"
        :max="5"
        :step="0.25"
        :model-value="store.crossfadeSeconds"
        @update:model-value="(v) => (store.crossfadeSeconds = v)"
      />
    </SettingsAccordion>

    <SettingsAccordion title="Transform">
      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-zinc-500">X<input class="field mt-1" type="number" :value="Math.round(store.composition.x * store.outputWidth)" @change="setPixel('x', $event)" /></label>
        <label class="text-xs text-zinc-500">Y<input class="field mt-1" type="number" :value="Math.round(store.composition.y * store.outputHeight)" @change="setPixel('y', $event)" /></label>
        <label class="text-xs text-zinc-500">Width<input class="field mt-1" type="number" min="2" :value="Math.round(store.composition.width * store.outputWidth)" @change="setPixel('width', $event)" /></label>
        <label class="text-xs text-zinc-500">Height<input class="field mt-1" type="number" min="2" :value="Math.round(store.composition.height * store.outputHeight)" @change="setPixel('height', $event)" /></label>
        <label class="text-xs text-zinc-500">Rotation<input class="field mt-1" type="number" min="-180" max="180" step="0.1" :value="store.composition.rotation" @change="setNumber('rotation', $event)" /></label>
        <label class="text-xs text-zinc-500">Opacity<input class="field mt-1" type="number" min="0" max="100" :value="Math.round(store.composition.opacity * 100)" @change="setOpacity($event)" /></label>
      </div>
      <div class="mt-2 flex gap-2">
        <button class="btn cursor-pointer" :class="store.composition.flipH ? 'btn-primary' : 'btn-ghost'" type="button" @click="toggleFlip('flipH')">Flip horizontal</button>
        <button class="btn cursor-pointer" :class="store.composition.flipV ? 'btn-primary' : 'btn-ghost'" type="button" @click="toggleFlip('flipV')">Flip vertical</button>
      </div>
    </SettingsAccordion>

    <SettingsAccordion title="Audio">
      <select v-model="store.audioMode" class="field">
        <option value="none">No audio</option>
        <option value="source" :disabled="!store.hasAudio">Original video audio</option>
        <option value="upload">Background audio</option>
      </select>
      <AudioFileField
        v-if="store.audioMode === 'upload'"
        class="mt-3"
        :file-name="store.audioFileName"
        @files="onAudioFiles"
        @clear="store.clearAudio()"
      />
      <AdvancedAudioControls
        v-if="store.audioMode !== 'none'"
        class="mt-3"
        v-model:volume="store.audioVolume"
        v-model:fade-in="store.audioFadeIn"
        v-model:fade-out="store.audioFadeOut"
        v-model:loop="store.loopAudio"
        volume-as-percent
        loop-label="Loop background audio"
      />
    </SettingsAccordion>

    <p class="text-xs text-zinc-500">
      Approximate output size: ~{{ (store.sizeEstimate / (1024 * 1024 * 1024)).toFixed(2) }} GB (estimate only)
    </p>
  </div>
</template>
