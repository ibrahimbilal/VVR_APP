<script setup lang="ts">
import { ANCHORS } from '@shared/thumbnailLayout'
import {
  BADGE_STYLES,
  QUALITY_OPTIONS,
  THUMBNAIL_OUTPUTS,
  parseDurationText,
  qualityIdFromText,
  type BadgeId,
  type BadgeStyleId,
  type QualityId,
} from '@shared/thumbnailProject'
import { computed } from 'vue'
import { badgeMarkup } from '../lib/badgeHtml'
import FileDropZone from '../../../components/FileDropZone.vue'
import SliderField from '../../../components/SliderField.vue'
import ToggleSwitch from '../../../components/ToggleSwitch.vue'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()

const badges = [
  { id: 'resolution' as const, title: 'Resolution Badge' },
  { id: 'duration' as const, title: 'Duration Badge' },
]

const zoom = computed(() => {
  const width = store.doc.image.crop.w
  if (!Number.isFinite(width) || width <= 0) return 1
  return Math.min(4, Math.max(1, 1 / width))
})

function onFiles(files: File[]): void {
  const file = files[0]
  if (file) void store.uploadImage(file)
}

async function updateFromScreensaver(): Promise<void> {
  store.requestReplaceOnNextTransfer()
  const { createThumbnailFromScreensaver } = await import('../../frame-screensaver/lib/createThumbnail')
  await createThumbnailFromScreensaver(store.doc.source.linkMode === 'linked' ? 'linked' : 'snapshot')
  store.clearReplaceOnNextTransfer()
}

function onQuality(id: BadgeId, event: Event): void {
  const value = (event.target as HTMLSelectElement).value as QualityId
  store.setResolutionChoice(value)
  if (value === 'custom' && qualityIdFromText(store.doc.resolution.text) !== 'custom') store.setBadgeText(id, '')
}

function onDurationHours(event: Event): void {
  const hours = Number((event.target as HTMLInputElement).value)
  const minutes = parseDurationText(store.doc.duration.text)?.minutes ?? 0
  store.setDurationParts(hours, minutes)
}

function onDurationMinutes(event: Event): void {
  const minutes = Number((event.target as HTMLInputElement).value)
  const hours = parseDurationText(store.doc.duration.text)?.hours ?? 0
  store.setDurationParts(hours, minutes)
}

function onText(id: BadgeId, event: Event): void {
  store.setBadgeText(id, (event.target as HTMLInputElement).value)
}

const sharedStyle = computed(() =>
  store.doc.resolution.appearance.styleId === store.doc.duration.appearance.styleId ? store.doc.resolution.appearance.styleId : null,
)

function swatch(styleId: BadgeStyleId): string {
  return badgeMarkup(styleId, '4K UHD', 132)
}

function onExportSize(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  const [width, height] = value.split('x').map(Number)
  store.setExportSize(width, height)
}
</script>

<template>
  <aside class="flex min-h-0 w-full max-h-[55vh] min-w-0 shrink-0 flex-col border-t border-zinc-800 lg:max-h-none lg:w-[400px] lg:border-t-0 lg:border-l">
    <div class="min-h-0 flex-1 overflow-y-auto">
      <section class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Image</h2>
        <FileDropZone
          compact
          accept="image/png,image/jpeg,image/webp"
          :label="store.hasImage ? 'Replace image' : 'Upload image'"
          formats="PNG, JPEG, WebP"
          @files="onFiles"
        />
        <p v-if="store.hasComposition" class="text-xs leading-5 text-zinc-400">
          Frame Screensaver crop, placement, and frame are already in this image.
        </p>
        <template v-else>
          <div class="grid grid-cols-2 gap-2">
            <button class="btn cursor-pointer" :class="store.doc.image.fit === 'cover' ? 'btn-primary' : 'btn-ghost'" type="button" @click="store.setFit('cover')">Cover</button>
            <button class="btn cursor-pointer" :class="store.doc.image.fit === 'contain' ? 'btn-primary' : 'btn-ghost'" type="button" @click="store.setFit('contain')">Contain</button>
          </div>
          <SliderField label="Zoom" :model-value="Math.round(zoom * 100) / 100" :min="1" :max="4" :step="0.05" suffix="×" @update:model-value="store.setZoom($event)" />
          <SliderField
            label="Horizontal"
            :model-value="Math.round(store.doc.image.crop.x * 100)"
            :min="0"
            :max="Math.max(0, Math.round((1 - store.doc.image.crop.w) * 100))"
            suffix="%"
            @update:model-value="store.setPan('x', $event / 100)"
          />
          <SliderField
            label="Vertical"
            :model-value="Math.round(store.doc.image.crop.y * 100)"
            :min="0"
            :max="Math.max(0, Math.round((1 - store.doc.image.crop.h) * 100))"
            suffix="%"
            @update:model-value="store.setPan('y', $event / 100)"
          />
          <button class="btn btn-ghost cursor-pointer" type="button" @click="store.resetCrop()">Reset image</button>
        </template>
        <button v-if="store.doc.source.app === 'frame-screensaver'" class="btn btn-ghost w-full cursor-pointer" type="button" @click="updateFromScreensaver">
          Update from Frame Screensaver
        </button>
      </section>

      <section v-for="section in badges" :key="section.id" class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{{ section.title }}</h2>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-zinc-200">Show badge</span>
          <ToggleSwitch :model-value="store.doc[section.id].enabled" :aria-label="`Show ${section.title}`" @update:model-value="store.setBadgeEnabled(section.id, $event)" />
        </div>

        <template v-if="section.id === 'resolution'">
          <label class="block text-xs text-zinc-400">
            Resolution
            <select class="field mt-1" :value="qualityIdFromText(store.doc.resolution.text)" @change="onQuality(section.id, $event)">
              <option v-for="option in QUALITY_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
            </select>
          </label>
        </template>
        <div v-else class="grid grid-cols-2 gap-2">
          <label class="block text-xs text-zinc-400">
            Hours
            <input class="field mt-1" type="number" min="0" max="99" :value="parseDurationText(store.doc.duration.text)?.hours ?? ''" @change="onDurationHours" />
          </label>
          <label class="block text-xs text-zinc-400">
            Minutes
            <input class="field mt-1" type="number" min="0" max="59" :value="parseDurationText(store.doc.duration.text)?.minutes ?? ''" @change="onDurationMinutes" />
          </label>
        </div>
        <label class="block text-xs text-zinc-400">
          Badge text
          <input class="field mt-1" type="text" maxlength="32" :value="store.doc[section.id].text" @input="onText(section.id, $event)" />
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
          :model-value="Math.round(store.doc[section.id].margin * 100)"
          :min="0"
          :max="20"
          suffix="%"
          @update:model-value="store.setMargin(section.id, $event / 100)"
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
      </section>

      <section class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Badge style</h2>
        <p class="text-xs text-zinc-500">Same look on the resolution and duration badges.</p>
        <SliderField
          label="Badge size"
          :model-value="Math.round(store.doc.resolution.appearance.scale * 100)"
          :min="40"
          :max="200"
          suffix="%"
          @update:model-value="store.setBadgeScale($event / 100)"
        />
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="style in BADGE_STYLES"
            :key="style.id"
            class="flex cursor-pointer items-center justify-center rounded-md p-2"
            :class="sharedStyle === style.id ? 'bg-zinc-800 ring-2 ring-amber-300' : 'hover:bg-zinc-900'"
            type="button"
            :aria-label="style.label"
            :aria-pressed="sharedStyle === style.id"
            @click="store.setBadgeStyle(style.id)"
          >
            <span class="pointer-events-none" v-html="swatch(style.id)" />
          </button>
        </div>
      </section>
    </div>

    <div class="shrink-0 space-y-3 border-t border-zinc-800 p-4">
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
      <button class="btn btn-primary w-full cursor-pointer" type="button" :disabled="store.exporting" @click="store.download()">
        Download Thumbnail
      </button>
    </div>
  </aside>
</template>
