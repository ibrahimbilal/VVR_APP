<script setup lang="ts">
import { OUTPUTS, FRAME_RATES, frameMetrics } from '@shared/frame'
import { AudioLines, ListOrdered, Minus, Palette, SlidersHorizontal, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2, Trophy } from '@lucide/vue'
import { computed, ref } from 'vue'
import { FONT_OPTIONS, RANK_COLORS } from '../lib/presets'
import { useProjectStore } from '../stores/project'
import ColorField from './ColorField.vue'
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
const musicInput = ref<HTMLInputElement | null>(null)
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

function onResolution(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const [width, height] = target.value.split('x').map(Number)
  if (width && height) store.setResolution(width, height)
}
</script>

<template>
  <aside class="min-h-0 overflow-y-auto border-zinc-800 bg-[#16181d] xl:border-l">
    <div class="space-y-6 p-4">
      <section>
        <h2 class="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Presets</h2>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="preset in presets"
            :key="preset.id"
            class="btn"
            :class="store.activePreset === preset.id ? 'btn-primary' : 'btn-ghost'"
            type="button"
            @click="store.applyPreset(preset.id)"
          >
            <component :is="preset.icon" :size="16" />
            {{ preset.label }}
          </button>
          <button class="btn" :class="store.activePreset === 'custom' ? 'btn-primary' : 'btn-ghost'" type="button">
            <SlidersHorizontal :size="16" />
            Custom
          </button>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Title</h2>
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
            <label class="chip">
              <span>{{ span.text }}</span>
              <input
                type="color"
                :value="span.color"
                @input="store.setSpanColor(index, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </template>
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
            class="btn flex-1"
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
      </section>

      <section class="space-y-3">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Ranking</h2>
        <ColorField v-model="store.style.ranking.color" label="Number color" />
        <div class="flex flex-wrap gap-2">
          <button
            v-for="color in RANK_COLORS"
            :key="color"
            class="h-7 w-7 rounded-full border border-white/20"
            :style="{ background: color }"
            type="button"
            @click="store.style.ranking.color = color"
          ></button>
          <button class="btn btn-ghost px-2 py-1" type="button" @click="store.cycleRankColors">
            <Palette :size="16" />
            Cycle across clips
          </button>
        </div>
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
        <SliderField v-model="store.style.ranking.positionY" label="Top position" :min="0" :max="Math.round(metrics.videoHeight * 0.7)" suffix="px" />
        <SliderField v-model="store.style.ranking.outlineWidth" label="Outline" :min="0" :max="28" suffix="px" />
        <ColorField v-model="store.style.ranking.outlineColor" label="Outline color" />
        <SliderField v-model="store.style.ranking.opacity" label="Opacity" :min="0.2" :max="1" :step="0.05" />
        <label class="flex items-center justify-between text-xs text-zinc-300">
          Number shadow
          <input v-model="store.style.ranking.shadow" type="checkbox" />
        </label>
      </section>

      <section class="space-y-3">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Video</h2>
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
        <label class="flex items-center justify-between text-xs text-zinc-300">
          Show clip titles
          <input v-model="store.style.caption.enabled" type="checkbox" />
        </label>
        <template v-if="store.style.caption.enabled">
          <SliderField v-model="store.style.caption.fontSize" label="Clip title size" :min="18" :max="90" suffix="px" />
          <ColorField v-model="store.style.caption.color" label="Clip title color" />
        </template>
        <div class="space-y-2">
          <button class="btn btn-ghost w-full" type="button" @click="musicInput?.click()">
            <AudioLines :size="16" />
            {{ store.musicName ? 'Replace background music' : 'Add background music' }}
          </button>
          <p v-if="store.musicName" class="truncate text-xs text-zinc-400">{{ store.musicName }}</p>
          <button v-if="store.musicName" class="btn btn-danger w-full" type="button" @click="store.setMusic(null)">
            <Trash2 :size="16" />
            Remove music
          </button>
          <input ref="musicInput" class="hidden" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" @change="onMusic" />
        </div>
        <SliderField
          v-if="store.musicName"
          :model-value="Math.round(store.style.video.musicVolume * 100)"
          label="Music volume"
          :min="0"
          :max="100"
          suffix="%"
          @update:model-value="store.style.video.musicVolume = $event / 100"
        />
      </section>
    </div>
  </aside>
</template>
