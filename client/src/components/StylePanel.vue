<script setup lang="ts">
import { OUTPUTS, FRAME_RATES, frameMetrics } from '@shared/frame'
import { AudioLines, Hash, ListOrdered, Minus, Palette, Plus, SlidersHorizontal, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2, Trophy, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { usePlayback } from '../composables/usePlayback'
import { formatRank, pageLabel } from '../lib/format'
import { FONT_OPTIONS } from '../lib/presets'
import { useProjectStore } from '../stores/project'
import ColorField from './ColorField.vue'
import ColorSwatches from './ColorSwatches.vue'
import SettingsAccordion from './SettingsAccordion.vue'
import SliderField from './SliderField.vue'

const aligns = [
  { id: 'left' as const, icon: TextAlignStart, label: 'Align left' },
  { id: 'center' as const, icon: TextAlignCenter, label: 'Align center' },
  { id: 'right' as const, icon: TextAlignEnd, label: 'Align right' },
]
const presets = [
  { id: 'classic' as const, label: 'Classic Ranking', icon: Trophy },
  { id: 'tier' as const, label: 'Tier List', icon: ListOrdered },
  { id: 'minimal' as const, label: 'Minimal', icon: Minus },
]

const store = useProjectStore()
const playback = usePlayback()
const exampleIndex = computed(() => {
  if (playback.activeIndex.value >= 0) return playback.activeIndex.value
  const selected = store.clips.findIndex((clip) => clip.id === store.selectedClipId)
  return selected >= 0 ? selected : 0
})
const exampleTotal = computed(() => Math.max(store.clips.length, 1))
const pageExample = computed(() => `${pageLabel(exampleIndex.value, exampleTotal.value)} Title`)
const numberExample = computed(() => `${formatRank(exampleIndex.value, store.style.ranking.format)} Title`)
const musicInput = ref<HTMLInputElement | null>(null)
const wordIndex = ref(0)
const activeWord = computed(() => store.spans[Math.min(wordIndex.value, Math.max(0, store.spans.length - 1))] ?? null)
const bannerLimit = computed(() => Math.round(store.style.video.height * 0.42))
const metrics = computed(() => frameMetrics(store.style.video.width, store.style.video.height, store.style.banner.height))

function onMusic(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  void store.setMusic(target.files?.[0] ?? null)
  target.value = ''
}

function onBannerHeight(value: number) {
  const even = Math.round(value) % 2 === 0 ? Math.round(value) : Math.round(value) - 1
  store.style.banner.height = Math.max(80, even)
}

function onWordColor(color: string) {
  if (!activeWord.value) return
  const index = store.spans.findIndex((span) => span.id === activeWord.value?.id)
  if (index >= 0) store.setSpanColor(index, color)
}

function onAddPaletteColor(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  store.addPaletteColor(target.value)
}

function onResolution(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const [width, height] = target.value.split('x').map(Number)
  if (width && height) store.setResolution(width, height)
}
</script>

<template>
  <aside class="min-h-0 overflow-y-auto border-zinc-800 bg-[#16181d] xl:border-l">
    <SettingsAccordion title="Presets" open>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="preset in presets"
            :key="preset.id"
            class="btn cursor-pointer"
            :class="store.activePreset === preset.id ? 'btn-primary' : 'btn-ghost'"
            type="button"
            @click="store.applyPreset(preset.id)"
          >
            <component :is="preset.icon" :size="16" />
            {{ preset.label }}
          </button>
          <button class="btn cursor-pointer" :class="store.activePreset === 'custom' ? 'btn-primary' : 'btn-ghost'" type="button">
            <SlidersHorizontal :size="16" />
            Custom
          </button>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            class="btn cursor-pointer"
            :class="store.style.ranking.display !== 'page' ? 'btn-primary' : 'btn-ghost'"
            type="button"
            @click="store.style.ranking.display = 'stack'"
          >
            <ListOrdered :size="16" />
            All numbers
          </button>
          <button
            class="btn cursor-pointer"
            :class="store.style.ranking.display === 'page' ? 'btn-primary' : 'btn-ghost'"
            type="button"
            @click="store.style.ranking.display = 'page'"
          >
            <Hash :size="16" />
            Current number
          </button>
        </div>
        <div v-if="store.style.ranking.display === 'page'" class="mt-2 grid grid-cols-2 gap-2">
          <button
            class="btn cursor-pointer"
            :class="store.style.ranking.pageStyle !== 'number' ? 'btn-primary' : 'btn-ghost'"
            type="button"
            @click="store.style.ranking.pageStyle = 'fraction'"
          >
            {{ pageExample }}
          </button>
          <button
            class="btn cursor-pointer"
            :class="store.style.ranking.pageStyle === 'number' ? 'btn-primary' : 'btn-ghost'"
            type="button"
            @click="store.style.ranking.pageStyle = 'number'"
          >
            {{ numberExample }}
          </button>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-zinc-500">
          <template v-if="store.style.ranking.display === 'page'">Pagination shows {{ pageExample }}. Current clip shows {{ numberExample }}.</template>
          <template v-else>All numbers lists every clip.</template>
        </p>
    </SettingsAccordion>

    <SettingsAccordion title="Color sets">
        <p class="text-[11px] leading-relaxed text-zinc-500">Shared colors for the number, title words, and clip title. They stay available in every project.</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="set in store.colorSets"
            :key="set.id"
            class="btn cursor-pointer"
            :class="store.activeColorSetId === set.id ? 'btn-primary' : 'btn-ghost'"
            type="button"
            @click="store.setActiveColorSet(set.id)"
          >
            {{ set.name || 'Untitled' }}
          </button>
          <button class="btn cursor-pointer btn-ghost px-2" type="button" aria-label="Add color set" title="Add color set" @click="store.addColorSet">
            <Plus :size="16" />
          </button>
        </div>
        <label class="block text-xs text-zinc-400">
          Set name
          <input class="field mt-1" maxlength="40" :value="store.activeColorSet?.name ?? ''" @input="store.renameColorSet(($event.target as HTMLInputElement).value)" />
        </label>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="color in store.activeColors"
            :key="color"
            class="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-[#101114] py-1 pl-1 pr-2"
          >
            <span class="h-5 w-5 rounded-full border border-white/20" :style="{ background: color }"></span>
            <button
              class="cursor-pointer text-zinc-400 disabled:cursor-not-allowed"
              type="button"
              :aria-label="`Remove ${color}`"
              :disabled="store.activeColors.length <= 1"
              @click="store.removePaletteColor(color)"
            >
              <X :size="12" />
            </button>
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <label class="btn cursor-pointer btn-ghost">
            <input type="color" value="#ffffff" aria-label="Add a color" @change="onAddPaletteColor" />
            Add color
          </label>
          <button v-if="store.colorSets.length > 1" class="btn cursor-pointer btn-danger" type="button" @click="store.removeColorSet(store.activeColorSetId)">
            <Trash2 :size="16" />
            Delete set
          </button>
          <button class="btn cursor-pointer btn-ghost" type="button" @click="store.resetColorSets">Reset defaults</button>
        </div>
    </SettingsAccordion>

    <SettingsAccordion title="Title">
        <textarea
          class="field min-h-20 resize-y"
          :value="store.titleText"
          maxlength="180"
          @input="store.setTitleText(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <p class="text-[11px] text-zinc-500">Press Enter for a new line. Each word can have its own color.</p>
        <div class="flex flex-wrap gap-2">
          <template v-for="(span, index) in store.spans" :key="span.id">
            <span v-if="span.breakBefore" class="basis-full"></span>
            <div class="chip cursor-pointer" :class="activeWord?.id === span.id ? 'ring-2 ring-amber-300' : ''" @click="wordIndex = index">
              <span>{{ span.text }}</span>
              <input
                type="color"
                :value="span.color"
                :aria-label="`Custom color for ${span.text}`"
                @input="store.setSpanColor(index, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </template>
        </div>
        <div v-if="activeWord" class="space-y-2">
          <p class="text-[11px] text-zinc-500">Color set for “{{ activeWord.text }}”</p>
          <ColorSwatches :model-value="activeWord.color" @pick="onWordColor" />
        </div>
        <ColorField v-model="store.style.banner.background" label="Banner background" />
        <label class="block text-xs text-zinc-400">
          Font
          <select v-model="store.style.banner.fontFamily" class="field mt-1">
            <option v-for="font in FONT_OPTIONS" :key="font" :value="font">{{ font }}</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">
          Weight
          <select v-model.number="store.style.banner.fontWeight" class="field mt-1">
            <option :value="400">Regular</option>
            <option :value="500">Medium</option>
            <option :value="700">Bold</option>
            <option :value="800">Extra bold</option>
          </select>
        </label>
        <div class="flex gap-2">
          <button
            v-for="align in aligns"
            :key="align.id"
            class="btn cursor-pointer flex-1"
            :class="store.style.banner.align === align.id ? 'btn-primary' : 'btn-ghost'"
            type="button"
            :aria-label="align.label"
            :title="align.label"
            @click="store.style.banner.align = align.id"
          >
            <component :is="align.icon" :size="16" />
          </button>
        </div>
        <SliderField v-model="store.style.banner.fontSize" label="Font size" :min="28" :max="140" suffix="px" />
        <SliderField label="Banner height" :model-value="metrics.bannerHeight" :min="80" :max="bannerLimit" :step="2" suffix="px" @update:model-value="onBannerHeight" />
        <SliderField v-model="store.style.banner.lineHeight" label="Line spacing" :min="0.9" :max="1.6" :step="0.01" />
        <SliderField v-model="store.style.banner.outlineWidth" label="Text outline" :min="0" :max="12" suffix="px" />
        <ColorField v-model="store.style.banner.outlineColor" label="Outline color" />
        <label class="flex items-center justify-between text-xs text-zinc-300">
          Text shadow
          <input v-model="store.style.banner.shadow" type="checkbox" />
        </label>
    </SettingsAccordion>

    <SettingsAccordion title="Ranking">
        <ColorField v-model="store.style.ranking.color" label="Number color" />
        <button class="btn cursor-pointer btn-ghost px-2 py-1" type="button" @click="store.cycleRankColors">
          <Palette :size="16" />
          Cycle across clips
        </button>
        <label class="block text-xs text-zinc-400">
          Font
          <select v-model="store.style.ranking.fontFamily" class="field mt-1">
            <option v-for="font in FONT_OPTIONS" :key="font" :value="font">{{ font }}</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">
          Format
          <select v-model="store.style.ranking.format" class="field mt-1">
            <option value="dot">1.</option>
            <option value="plain">1</option>
            <option value="hash">#1</option>
            <option value="pad">01</option>
          </select>
        </label>
        <SliderField v-model="store.style.ranking.fontSize" label="Number size" :min="36" :max="360" suffix="px" />
        <SliderField v-model="store.style.ranking.positionX" label="Left position" :min="0" :max="Math.round(store.style.video.width * 0.7)" suffix="px" />
        <SliderField v-model="store.style.ranking.positionY" label="Top position" :min="0" :max="Math.round(metrics.videoHeight * 0.95)" suffix="px" />
        <SliderField v-model="store.style.ranking.outlineWidth" label="Outline" :min="0" :max="28" suffix="px" />
        <ColorField v-model="store.style.ranking.outlineColor" label="Outline color" />
        <SliderField v-model="store.style.ranking.opacity" label="Opacity" :min="0.2" :max="1" :step="0.05" />
        <label class="flex items-center justify-between text-xs text-zinc-300">
          Number shadow
          <input v-model="store.style.ranking.shadow" type="checkbox" />
        </label>
    </SettingsAccordion>

    <SettingsAccordion title="Video">
        <label class="block text-xs text-zinc-400">
          Output
          <select class="field mt-1" :value="`${store.style.video.width}x${store.style.video.height}`" @change="onResolution">
            <option v-for="output in OUTPUTS" :key="output.label" :value="`${output.width}x${output.height}`">{{ output.label }} · 9:16</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">
          Frame rate
          <select v-model.number="store.style.video.fps" class="field mt-1">
            <option v-for="fps in FRAME_RATES" :key="fps" :value="fps">{{ fps }} fps</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">
          Scaling
          <select v-model="store.style.video.scaleMode" class="field mt-1">
            <option value="crop">Crop (fill the frame)</option>
            <option value="fit">Fit (show the whole frame)</option>
            <option value="blur">Blurred background</option>
          </select>
        </label>
        <ColorField v-if="store.style.video.scaleMode !== 'crop'" v-model="store.style.video.backgroundColor" label="Padding color" />
        <label class="block text-xs text-zinc-400">
          Transition
          <select v-model="store.style.video.transition" class="field mt-1">
            <option value="cut">Hard cut</option>
            <option value="fade">Crossfade</option>
          </select>
        </label>
        <SliderField
          v-if="store.style.video.transition === 'fade'"
          v-model="store.style.video.fadeDuration"
          label="Crossfade"
          :min="0.1"
          :max="1"
          :step="0.05"
          suffix="s"
        />
        <label class="flex items-center justify-between text-xs text-zinc-300">
          Show clip titles
          <input v-model="store.style.caption.enabled" type="checkbox" />
        </label>
        <SliderField v-if="store.style.caption.enabled" v-model="store.style.caption.fontSize" label="Clip title size" :min="18" :max="90" suffix="px" />
        <p v-if="store.style.caption.enabled" class="text-[11px] leading-relaxed text-zinc-500">Each clip has its own title color in the selected clip column.</p>
    </SettingsAccordion>

    <SettingsAccordion title="Audio">
        <label class="flex items-center justify-between text-xs text-zinc-300">
          Keep original audio
          <input v-model="store.style.video.keepAudio" type="checkbox" />
        </label>
        <label v-if="store.style.video.keepAudio" class="flex items-center justify-between text-xs text-zinc-300">
          Normalize audio
          <input v-model="store.style.video.normalize" type="checkbox" />
        </label>
        <SliderField
          v-if="store.style.video.keepAudio"
          :model-value="Math.round(store.style.video.originalVolume * 100)"
          label="Clip volume"
          :min="0"
          :max="100"
          suffix="%"
          @update:model-value="store.style.video.originalVolume = $event / 100"
        />
        <div class="space-y-2 border-t border-zinc-800 pt-3">
          <button class="btn cursor-pointer btn-ghost w-full" type="button" @click="musicInput?.click()">
            <AudioLines :size="16" />
            {{ store.musicName ? 'Replace background music' : 'Add background music' }}
          </button>
          <p v-if="store.musicName" class="truncate text-xs text-zinc-400">{{ store.musicName }}</p>
          <button v-if="store.musicName" class="btn cursor-pointer btn-danger w-full" type="button" @click="store.setMusic(null)">
            <Trash2 :size="16" />
            Remove music
          </button>
          <input ref="musicInput" class="hidden" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" @change="onMusic" />
          <SliderField
            v-if="store.musicName"
            :model-value="Math.round(store.style.video.musicVolume * 100)"
            label="Music volume"
            :min="0"
            :max="100"
            suffix="%"
            @update:model-value="store.style.video.musicVolume = $event / 100"
          />
        </div>
    </SettingsAccordion>
  </aside>
</template>
