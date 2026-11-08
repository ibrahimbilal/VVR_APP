<script setup lang="ts">
import {
  formatBytes,
  resizeModeLabel,
  resizeSummary,
  resolveExportDimensions,
  resolveIntermediateDimensions,
  resolveEffectiveScale,
  RESOLUTION_PRESETS,
  type CropPosition,
  type PaddingChoice,
  type ResizeMode,
  type ScaleFactor,
  type SharpenPreset,
  type UpscaleEngineId,
} from '@shared/imageUpscaler'
import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Crosshair } from '@lucide/vue'
import { computed, type Component } from 'vue'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
const interDims = computed(() => {
  if (!store.selected) return null
  if (store.selected.intermediateWidth && store.selected.intermediateHeight) {
    return { width: store.selected.intermediateWidth, height: store.selected.intermediateHeight }
  }
  const { effectiveScale } = resolveEffectiveScale(store.settings, store.selected.width, store.selected.height, store.limits)
  return resolveIntermediateDimensions(store.selected.width, store.selected.height, effectiveScale)
})
const summary = computed(() =>
  store.selected ? resizeSummary(store.selected.width, store.selected.height, store.settings, interDims.value?.width ?? 0, interDims.value?.height ?? 0) : null,
)
const exportDims = computed(() =>
  store.selected && interDims.value
    ? resolveExportDimensions(store.selected.width, store.selected.height, interDims.value.width, interDims.value.height, store.settings)
    : null,
)
const scaleChoices: Array<{ id: ScaleFactor; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 1, label: '1×' },
  { id: 2, label: '2×' },
  { id: 3, label: '3×' },
  { id: 4, label: '4×' },
]
const ai = computed(() => store.capabilities?.engines['realesrgan-lite'] ?? null)
const aiReady = computed(() => ai.value?.available === true)
const engines: Array<{ id: UpscaleEngineId; label: string }> = [
  { id: 'lanczos3', label: 'Standard' },
  { id: 'realesrgan-lite', label: 'AI Lite' },
]
const modes: Array<{ id: ResizeMode; label: string }> = [
  { id: 'contain', label: 'Contain' },
  { id: 'cover', label: 'Cover' },
  { id: 'fill', label: 'Fill' },
]
const crops: Array<{ id: CropPosition; label: string; icon: Component }> = [
  { id: 'left', label: 'Left', icon: ArrowLeftToLine },
  { id: 'center', label: 'Center', icon: Crosshair },
  { id: 'right', label: 'Right', icon: ArrowRightToLine },
  { id: 'top', label: 'Top', icon: ArrowUpToLine },
  { id: 'bottom', label: 'Bottom', icon: ArrowDownToLine },
]
const paddings: Array<{ id: PaddingChoice; label: string }> = [
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
  { id: 'custom', label: 'Custom' },
  { id: 'transparent', label: 'Transparent' },
]
const sharpens: Array<{ id: SharpenPreset; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'moderate', label: 'Moderate' },
]

function setNumber(key: 'width' | 'height' | 'quality', value: string): void {
  const number = Number(value)
  if (!Number.isFinite(number)) return
  store.settings[key] = Math.round(number)
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Upscaling</h2>
      <p class="mt-1 text-[11px] font-medium text-zinc-400">Engine</p>
      <div class="mt-2 grid grid-cols-2 gap-1">
        <button
          v-for="engine in engines"
          :key="engine.id"
          class="btn cursor-pointer"
          :class="store.settings.engine === engine.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          :disabled="engine.id === 'realesrgan-lite' && !aiReady"
          :title="engine.id === 'realesrgan-lite' && !aiReady ? (ai?.reason ?? 'AI Lite is not available on this server.') : engine.label"
          @click="store.setEngine(engine.id)"
        >
          {{ engine.label }}
        </button>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-zinc-500">Standard: Fast traditional resizing.</p>
      <p class="mt-1 text-[11px] leading-relaxed text-zinc-500">AI Lite: AI-assisted reconstruction for cleaner edges and textures. May alter fine artistic details.</p>
      <p v-if="!store.capabilities" class="mt-2 text-[11px] text-zinc-500">Checking whether AI Lite is available.</p>
      <p v-else-if="!aiReady" class="mt-2 text-[11px] leading-relaxed text-amber-200">{{ ai?.reason ?? 'AI Lite is not available on this server.' }}</p>
      <p v-else-if="store.settings.engine === 'realesrgan-lite' && ai?.matchesUpscaylLite" class="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Model {{ ai?.model }}. This is the Upscayl Lite model at {{ ai?.scale }}×. The final exact size is still fitted here, so pixels can differ slightly from the Upscayl app.
      </p>
      <p v-else-if="store.settings.engine === 'realesrgan-lite'" class="mt-2 text-[11px] leading-relaxed text-amber-200">
        Model {{ ai?.model }}. This is not the Upscayl Lite model, so the look can differ from an Upscayl Lite export.
      </p>
    </div>

    <div>
      <p class="text-[11px] font-medium text-zinc-400">Factor</p>
      <p class="mt-0.5 text-[11px] text-zinc-500">Builds a lossless intermediate before export fitting.</p>
      <div class="mt-2 grid grid-cols-5 gap-1">
        <button
          v-for="scale in scaleChoices"
          :key="String(scale.id)"
          class="btn cursor-pointer px-2 text-[11px]"
          :class="store.settings.scaleFactor === scale.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="store.settings.scaleFactor = scale.id"
        >
          {{ scale.label }}
        </button>
      </div>
      <p class="mt-2 text-[11px] text-zinc-500">Auto picks a uniform factor up to 4× from the export target. AI Lite always infers at native 4×, then resizes to the effective factor.</p>
    </div>

    <div>
      <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Export</h2>
      <label class="mt-2 block text-xs text-zinc-400">
        Resolution
        <select class="field mt-1" :value="store.settings.preset" @change="store.setPreset(($event.target as HTMLSelectElement).value as typeof store.settings.preset)">
          <option v-for="preset in RESOLUTION_PRESETS" :key="preset.id" :value="preset.id">
            {{ preset.label }}<template v-if="preset.width && preset.height"> · {{ preset.width }}×{{ preset.height }}</template>
          </option>
        </select>
      </label>
      <div v-if="store.settings.preset === 'custom'" class="mt-2 grid grid-cols-2 gap-2">
        <label class="text-xs text-zinc-400">
          Width
          <input class="field mt-1" type="number" :min="store.limits.minEdge" :max="store.limits.maxOutputEdge" :value="store.settings.width" @change="setNumber('width', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="text-xs text-zinc-400">
          Height
          <input class="field mt-1" type="number" :min="store.limits.minEdge" :max="store.limits.maxOutputEdge" :value="store.settings.height" @change="setNumber('height', ($event.target as HTMLInputElement).value)" />
        </label>
      </div>
      <p v-if="store.settings.preset === 'original' || store.settings.preset === 'upscaled'" class="mt-2 text-[11px] text-zinc-500">
        <template v-if="store.settings.preset === 'original'">Fits the AI or Lanczos result back to the original file dimensions.</template>
        <template v-else>Saves at the intermediate upscaled size (contain/cover/fill still apply).</template>
      </p>
      <p v-else class="mt-2 text-[11px] text-zinc-500">Target {{ store.settings.width }}×{{ store.settings.height }}. Presets other than Custom always use those exact pixels.</p>
    </div>

    <div>
      <p class="text-xs font-semibold text-zinc-300">{{ resizeModeLabel(store.settings.mode) }}</p>
      <div class="mt-2 grid grid-cols-3 gap-1">
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="btn cursor-pointer"
          :class="store.settings.mode === mode.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="store.settings.mode = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>
      <p v-if="store.settings.mode === 'fill'" class="mt-2 text-[11px] text-amber-200">Fill stretches the image to the target size and can distort its proportions.</p>
      <div v-if="store.settings.mode === 'cover'" class="mt-2">
        <p class="text-xs text-zinc-400">Crop position</p>
        <div class="mt-1 flex flex-nowrap gap-1">
          <button
            v-for="crop in crops"
            :key="crop.id"
            class="btn h-8 w-8 shrink-0 cursor-pointer p-0"
            :class="store.settings.cropPosition === crop.id ? 'btn-primary' : 'btn-ghost'"
            type="button"
            :aria-label="`Crop position ${crop.label}`"
            :title="crop.label"
            @click="store.setCropPosition(crop.id)"
          >
            <component :is="crop.icon" :size="15" />
          </button>
        </div>
      </div>
      <div v-if="store.settings.mode === 'contain'" class="mt-2">
        <p class="text-xs text-zinc-400">Padding</p>
        <div class="mt-1 flex flex-wrap gap-1">
          <button
            v-for="padding in paddings"
            :key="padding.id"
            class="btn cursor-pointer"
            :class="store.settings.padding === padding.id ? 'btn-primary' : 'btn-ghost'"
            type="button"
            :disabled="padding.id === 'transparent' && store.settings.format === 'jpeg'"
            @click="store.settings.padding = padding.id"
          >
            {{ padding.label }}
          </button>
        </div>
        <label v-if="store.settings.padding === 'custom'" class="mt-2 block text-xs text-zinc-400">
          Custom color
          <input v-model="store.settings.paddingColor" class="mt-1 h-9 w-full" type="color" />
        </label>
        <p v-if="store.settings.format === 'jpeg'" class="mt-2 text-[11px] text-zinc-500">JPEG has no transparency. Transparent pixels and padding are flattened onto this background.</p>
      </div>
    </div>

    <div>
      <label class="block text-xs text-zinc-400">
        Format
        <select class="field mt-1" :value="store.settings.format" @change="store.setFormat(($event.target as HTMLSelectElement).value as typeof store.settings.format)">
          <option value="png">PNG (lossless)</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
      <label v-if="store.settings.format !== 'png'" class="mt-2 block text-xs text-zinc-400">
        Quality {{ store.settings.quality }}
        <input class="mt-1 w-full" type="range" min="60" max="100" :value="store.settings.quality" @input="setNumber('quality', ($event.target as HTMLInputElement).value)" />
      </label>
      <p v-else class="mt-2 text-[11px] text-zinc-500">PNG is written with lossless compression.</p>
      <p v-if="store.formatFromSource && store.selected" class="mt-2 text-[11px] text-zinc-500">Format follows the first uploaded image until you change it here.</p>
    </div>

    <div>
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-semibold text-zinc-300">Sharpen</p>
        <button class="text-[11px] font-semibold text-zinc-400" type="button" @click="store.settings.sharpen = 'none'">Reset</button>
      </div>
      <p class="mt-1 text-[11px] text-zinc-500">Optional, and separate from Lanczos3 resizing. None is the default. Higher strength can add halos.</p>
      <div class="mt-2 grid grid-cols-3 gap-1">
        <button
          v-for="preset in sharpens"
          :key="preset.id"
          class="btn cursor-pointer"
          :class="store.settings.sharpen === preset.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="store.settings.sharpen = preset.id"
        >
          {{ preset.label }}
        </button>
      </div>
    </div>

    <label class="flex items-start gap-2 text-xs text-zinc-300">
      <input v-model="store.settings.preserveWhenMatched" class="mt-0.5" type="checkbox" />
      <span v-if="store.settings.engine === 'realesrgan-lite'">AI Lite still enhances an image that is already the target size, then fits it to those exact pixels. This switch only skips resampling in Standard mode.</span>
      <span v-else>Skip Lanczos resampling when the image is already the target size and no other resize is needed.</span>
    </label>

    <div v-if="summary" class="space-y-1 rounded-lg border border-zinc-800 bg-[#101114] p-3 text-[11px] leading-relaxed text-zinc-400">
      <p>Original {{ summary.sourceWidth }}×{{ summary.sourceHeight }} · {{ summary.sourceAspect }} · {{ formatBytes(store.selected?.bytes ?? 0) }}</p>
      <p v-if="interDims">Intermediate {{ interDims.width }}×{{ interDims.height }}<template v-if="store.selected?.effectiveScale != null"> · {{ store.selected.effectiveScale }}×</template><template v-else-if="store.settings.scaleFactor !== 'auto'"> · {{ store.settings.scaleFactor }}×</template></p>
      <p v-if="exportDims">Export {{ exportDims.width }}×{{ exportDims.height }} · {{ summary.targetAspect }} · scale {{ summary.scaleLabel }}</p>
      <p v-else>Export {{ summary.targetWidth }}×{{ summary.targetHeight }} · {{ summary.targetAspect }} · scale {{ summary.scaleLabel }}</p>
      <p v-if="store.selected?.outputBytes != null">Output file {{ formatBytes(store.selected.outputBytes) }}</p>
      <p v-if="store.selected?.skippedResize">Resampling was skipped because the pixels already matched the target.</p>
      <p v-else-if="store.jobEngine === 'realesrgan-lite' && store.selected?.status === 'completed'">AI Lite ran on this image, then the result was fitted to the exact target size. Reconstructed detail was not in the original file.</p>
      <p v-if="summary.matchesTarget && store.settings.preserveWhenMatched" class="text-zinc-300">This image already matches the target size.</p>
      <p v-if="summary.warning" class="text-amber-200">{{ summary.warning }}</p>
      <p v-if="store.selected?.warning" class="text-amber-200">{{ store.selected.warning }}</p>
    </div>
  </div>
</template>
