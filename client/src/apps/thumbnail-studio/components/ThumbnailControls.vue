<script setup lang="ts">
import { ANCHORS, maxBadgeMarginPx } from '@shared/thumbnailLayout'
import { DURATION_BADGE_OPTIONS, RESOLUTION_BADGE_OPTIONS } from '@shared/thumbnailBadges'
import { BADGE_STYLES, THUMBNAIL_OUTPUTS, type BadgeStyleId } from '@shared/thumbnailProject'
import { computed } from 'vue'
import { stylePreviewSvgUrl } from '../lib/badgeAssets'
import FileDropZone from '../../../components/FileDropZone.vue'
import FileStatusBox from '../../../components/FileStatusBox.vue'
import SliderField from '../../../components/SliderField.vue'
import ToggleSwitch from '../../../components/ToggleSwitch.vue'
import { formatBytes } from '../../../lib/format'
import { fileStatusBoxLabel } from '../../../lib/fileStatusBox'
import { audioFormatLabel } from '../../../lib/media'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()

const badges = [
  { id: 'resolution' as const, title: 'Resolution Badge' },
  { id: 'duration' as const, title: 'Duration Badge' },
]

const marginMaxPx = computed(() => maxBadgeMarginPx(store.doc.export.width, store.doc.export.height))

const anyBadgeEnabled = computed(() => store.doc.resolution.enabled || store.doc.duration.enabled)

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

const showImageStatusBox = computed(() => Boolean(store.imageFileName))

const imageMetaParts = computed(() => {
  const parts: string[] = []
  const name = store.imageFileName
  if (name && store.imageFileStatus === 'ready') parts.push(audioFormatLabel(name))
  if (store.imageFileSize != null && store.imageFileSize > 0) parts.push(formatBytes(store.imageFileSize))
  const w = store.doc.image.sourceWidth
  const h = store.doc.image.sourceHeight
  if (w > 0 && h > 0) parts.push(`${w}×${h}`)
  return parts
})

const imageStatusLabel = computed(() =>
  fileStatusBoxLabel(store.imageFileStatus, { processingMessage: 'Reading image…' }),
)
</script>

<template>
  <aside class="flex min-h-0 w-full max-h-[55vh] min-w-0 shrink-0 flex-col border-t border-zinc-800 lg:max-h-none lg:w-[400px] lg:border-t-0 lg:border-l">
    <div class="min-h-0 flex-1 overflow-y-auto">
      <section class="border-b border-zinc-800 px-4 py-4">
        <label class="block">
          <span class="mb-1 block section-label">Project</span>
          <input
            class="field text-sm font-semibold"
            maxlength="80"
            type="text"
            :value="store.doc.name"
            @input="store.setName(($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>
      <section class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="section-label">Image</h2>
        <FileDropZone
          compact
          accept="image/png,image/jpeg,image/webp"
          :label="store.hasImage ? 'Replace image' : 'Upload image'"
          formats="PNG, JPEG, WebP"
          @files="onFiles"
        />
        <FileStatusBox
          v-if="showImageStatusBox && store.imageFileName"
          :file-name="store.imageFileName"
          :status="store.imageFileStatus"
          :status-label="imageStatusLabel"
          remove-label="Remove image"
          @remove="void store.clearImage()"
        >
          <template #meta>
            <span v-if="imageMetaParts.length > 0">{{ imageMetaParts.join(' · ') }}</span>
            <span v-if="store.imageFileError" class="text-red-300">
              <span v-if="imageMetaParts.length > 0"> · </span>{{ store.imageFileError }}
            </span>
          </template>
        </FileStatusBox>
        <p v-if="store.hasComposition" class="text-xs leading-5 text-zinc-400">
          Screensaver crop, placement, and frame are already in this image.
        </p>
        <button v-if="store.doc.source.app === 'frame-screensaver'" class="btn btn-ghost w-full cursor-pointer" type="button" @click="updateFromScreensaver">
          Update from Screensaver
        </button>
      </section>

      <section v-for="section in badges" :key="section.id" class="space-y-3 border-b border-zinc-800 px-4 py-4">
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

      <section v-if="anyBadgeEnabled" class="space-y-3 border-b border-zinc-800 px-4 py-4">
        <h2 class="section-label">Badge style</h2>
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
      <button
        class="btn btn-primary w-full cursor-pointer"
        type="button"
        :disabled="Boolean(store.exportDuplicateBlocker)"
        @click="store.download()"
      >
        Download Thumbnail
      </button>
      <p v-if="store.exportDuplicateBlocker" class="text-xs text-zinc-500">{{ store.exportDuplicateBlocker }}</p>
    </div>
  </aside>
</template>
