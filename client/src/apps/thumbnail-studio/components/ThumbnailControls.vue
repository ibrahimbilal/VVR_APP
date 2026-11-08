<script setup lang="ts">
import { ANCHORS, maxBadgeMarginPx } from '@shared/thumbnailLayout'
import { DURATION_BADGE_OPTIONS, RESOLUTION_BADGE_OPTIONS } from '@shared/thumbnailBadges'
import { BADGE_STYLES, THUMBNAIL_OUTPUTS, type BadgeStyleId } from '@shared/thumbnailProject'
import { Download } from '@lucide/vue'
import { computed, ref } from 'vue'
import { stylePreviewSvgUrl } from '../lib/badgeAssets'
import SliderField from '../../../components/SliderField.vue'
import ToggleSwitch from '../../../components/ToggleSwitch.vue'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()
const group = ref<'content' | 'output' | 'style'>('content')

const badges = [
  { id: 'resolution' as const, title: 'Resolution Badge' },
  { id: 'duration' as const, title: 'Duration Badge' },
]

const marginMaxPx = computed(() => maxBadgeMarginPx(store.doc.export.width, store.doc.export.height))

const anyBadgeEnabled = computed(() => store.doc.resolution.enabled || store.doc.duration.enabled)

function onResolution(event: Event): void {
  store.setResolutionLabel((event.target as HTMLSelectElement).value)
}

function onDuration(event: Event): void {
  store.setDurationLabel((event.target as HTMLSelectElement).value)
}

const sharedStyle = computed(() =>
  store.doc.resolution.appearance.styleId === store.doc.duration.appearance.styleId ? store.doc.resolution.appearance.styleId : null,
)

function swatchUrl(styleId: BadgeStyleId): string | null {
  return stylePreviewSvgUrl(styleId)
}

function onExportSize(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  const [width, height] = value.split('x').map(Number)
  store.setExportSize(width, height)
}
</script>

<template>
  <aside class="studio-panel flex min-h-0 w-full shrink-0 flex-col lg:h-full lg:w-[360px] lg:max-w-[360px] lg:flex-none">
    <div class="shrink-0 border-b border-zinc-800">
      <h2 class="px-4 pt-4 text-sm font-bold text-zinc-100">Settings</h2>
      <div class="grid grid-cols-3 gap-1 px-3 py-3" role="tablist">
        <button class="btn cursor-pointer px-1 text-xs" :class="group === 'content' ? 'btn-primary' : 'btn-ghost'" type="button" role="tab" :aria-selected="group === 'content'" @click="group = 'content'">Content</button>
        <button class="btn cursor-pointer px-1 text-xs" :class="group === 'output' ? 'btn-primary' : 'btn-ghost'" type="button" role="tab" :aria-selected="group === 'output'" @click="group = 'output'">Output</button>
        <button class="btn cursor-pointer px-1 text-xs" :class="group === 'style' ? 'btn-primary' : 'btn-ghost'" type="button" role="tab" :aria-selected="group === 'style'" @click="group = 'style'">Style</button>
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <section v-for="section in badges" v-show="group === 'content'" :key="section.id" class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="section-label">{{ section.title }}</h2>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-zinc-200">Show badge</span>
          <ToggleSwitch :model-value="store.doc[section.id].enabled" :aria-label="`Show ${section.title}`" @update:model-value="store.setBadgeEnabled(section.id, $event)" />
        </div>

        <template v-if="store.doc[section.id].enabled">
        <label v-if="section.id === 'resolution'" class="block text-xs text-zinc-400">
          Resolution
          <select class="field mt-1" :value="store.doc.resolution.text" @change="onResolution">
            <option v-for="option in RESOLUTION_BADGE_OPTIONS" :key="option.label" :value="option.label">{{ option.label }}</option>
          </select>
        </label>
        <label v-else class="block text-xs text-zinc-400">
          Duration
          <select class="field mt-1" :value="store.doc.duration.text" @change="onDuration">
            <option v-for="option in DURATION_BADGE_OPTIONS" :key="option.label" :value="option.label">{{ option.label }}</option>
          </select>
        </label>

        <div>
          <p class="mb-2 text-xs text-zinc-400">Position</p>
          <div class="grid grid-cols-3 gap-1">
            <button
              v-for="anchor in ANCHORS"
              :key="anchor.id"
              class="btn cursor-pointer px-1 py-2 text-[10px] leading-tight"
              :class="store.doc[section.id].anchor === anchor.id && !store.doc[section.id].deliberate ? 'btn-primary' : 'btn-ghost'"
              type="button"
              @click="store.place(section.id, anchor.id)"
            >
              {{ anchor.label }}
            </button>
          </div>
        </div>
        <SliderField
          v-if="!store.doc[section.id].deliberate"
          label="Distance from edges"
          :model-value="Math.round(store.doc[section.id].margin)"
          :min="0"
          :max="marginMaxPx"
          suffix="px"
          @update:model-value="store.setMargin(section.id, $event)"
        />
        <SliderField
          :label="store.doc[section.id].deliberate ? 'Horizontal position' : 'Horizontal offset'"
          :model-value="Math.round((store.doc[section.id].deliberate ? store.doc[section.id].x : store.doc[section.id].offsetX) * 100)"
          :min="store.doc[section.id].deliberate ? 0 : -45"
          :max="store.doc[section.id].deliberate ? 100 : 45"
          suffix="%"
          @update:model-value="store.setHorizontal(section.id, $event / 100)"
        />
        <SliderField
          :label="store.doc[section.id].deliberate ? 'Vertical position' : 'Vertical offset'"
          :model-value="Math.round((store.doc[section.id].deliberate ? store.doc[section.id].y : store.doc[section.id].offsetY) * 100)"
          :min="store.doc[section.id].deliberate ? 0 : -45"
          :max="store.doc[section.id].deliberate ? 100 : 45"
          suffix="%"
          @update:model-value="store.setVertical(section.id, $event / 100)"
        />
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.resetPosition(section.id)">Reset position</button>
        </template>
      </section>

      <section v-show="group === 'style'" class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="section-label">Badge style</h2>
        <p v-if="!anyBadgeEnabled" class="text-xs text-zinc-500">Turn on a resolution or duration badge in Content to choose a style.</p>
        <template v-if="anyBadgeEnabled">
        <p class="text-xs text-zinc-500">Same look on the resolution and duration badges. Previews show the 4K artwork.</p>
        <SliderField
          label="Badge size"
          :model-value="Math.round(store.doc.resolution.appearance.scale * 100)"
          :min="25"
          :max="200"
          suffix="%"
          @update:model-value="store.setBadgeScale($event / 100)"
        />
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="style in BADGE_STYLES"
            :key="style.id"
            class="flex cursor-pointer items-center justify-center rounded-md p-2"
            :class="sharedStyle === style.id ? 'bg-zinc-800 ring-2 ring-brand' : 'hover:bg-zinc-900'"
            type="button"
            :aria-label="style.label"
            :aria-pressed="sharedStyle === style.id"
            @click="store.setBadgeStyle(style.id)"
          >
            <img v-if="swatchUrl(style.id)" :src="swatchUrl(style.id)!" alt="" class="pointer-events-none h-10 w-auto max-w-full object-contain" />
          </button>
        </div>
        </template>
      </section>
      <section v-show="group === 'output'" class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="section-label">Export</h2>
        <label class="block text-xs text-zinc-400">
          Size
          <select class="field mt-1" :value="`${store.doc.export.width}x${store.doc.export.height}`" @change="onExportSize">
            <option v-for="size in THUMBNAIL_OUTPUTS" :key="size.label" :value="`${size.width}x${size.height}`">{{ size.label }}</option>
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn cursor-pointer" :class="store.doc.export.format === 'png' ? 'btn-primary' : 'btn-ghost'" type="button" @click="store.setExportFormat('png')">PNG</button>
          <button class="btn cursor-pointer" :class="store.doc.export.format === 'jpeg' ? 'btn-primary' : 'btn-ghost'" type="button" @click="store.setExportFormat('jpeg')">JPEG</button>
        </div>
        <SliderField
          v-if="store.doc.export.format === 'jpeg'"
          label="JPEG quality"
          :model-value="Math.round(store.doc.export.jpegQuality * 100)"
          :min="50"
          :max="100"
          suffix="%"
          @update:model-value="store.setJpegQuality($event / 100)"
        />
      </section>
    </div>

    <div class="shrink-0 space-y-3 border-t border-zinc-800 p-4">
      <button
        class="btn btn-primary w-full cursor-pointer py-3 text-sm"
        type="button"
        :disabled="Boolean(store.exportDuplicateBlocker)"
        @click="store.download()"
      >
        <Download :size="16" />
        Download Thumbnail
      </button>
      <p v-if="store.exportDuplicateBlocker" class="text-xs text-zinc-500">{{ store.exportDuplicateBlocker }}</p>
    </div>
  </aside>
</template>
