<script setup lang="ts">
import { CONTENT_BADGES, SEASONS, THUMBNAIL_TEMPLATES, badgeLabel, type ContentBadgeId, type SeasonId, type TemplateId } from '@shared/thumbnailProject'
import { computed, ref } from 'vue'
import FileDropZone from '../../../components/FileDropZone.vue'
import ToggleSwitch from '../../../components/ToggleSwitch.vue'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()
const presetName = ref('My preset')
const presetFile = ref<HTMLInputElement | null>(null)

const sections = computed(() => {
  const advanced = [
    ['templates', 'Templates'],
    ['assets', 'Assets'],
    ['text', 'Text'],
    ['badges', 'Badges'],
    ['backgrounds', 'Backgrounds'],
    ['frames', 'Frames'],
    ['presets', 'Presets'],
  ] as const
  if (store.mode === 'advanced') return advanced
  return advanced.filter((item) => item[0] === 'templates' || item[0] === 'assets' || item[0] === 'badges')
})

const quality = computed(() => store.project.layers.find((item) => item.badgeRole === 'quality'))
const duration = computed(() => store.project.layers.find((item) => item.badgeRole === 'duration'))
const content = computed(() => store.project.layers.find((item) => item.badgeRole === 'content'))
const background = computed(() => store.project.layers.find((item) => item.kind === 'background'))

function applyTemplate(id: TemplateId): void {
  store.applyBuiltInTemplate(id)
  if (id === 'seasonal') store.section = 'templates'
}

async function onPresetFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await store.importPresetJson(await file.text())
  ;(event.target as HTMLInputElement).value = ''
}

function downloadPreset(id: string): void {
  const json = store.presetJson(id)
  if (!json) return
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'thumbnail-preset.json'
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <aside class="flex max-h-[40vh] shrink-0 flex-col border-b border-zinc-800 xl:max-h-none xl:w-64 xl:border-b-0 xl:border-r">
    <div class="flex gap-1 overflow-x-auto border-b border-zinc-800 p-2">
      <button
        v-for="item in sections"
        :key="item[0]"
        class="btn cursor-pointer shrink-0 px-2 py-1 text-xs"
        :class="store.section === item[0] ? 'btn-primary' : 'btn-ghost'"
        type="button"
        @click="store.section = item[0]"
      >
        {{ item[1] }}
      </button>
    </div>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <template v-if="store.section === 'templates'">
        <button
          v-for="item in THUMBNAIL_TEMPLATES"
          :key="item.id"
          class="block w-full cursor-pointer rounded-md border px-3 py-2 text-left"
          :class="store.project.templateId === item.id ? 'border-amber-300 bg-amber-300/10' : 'border-zinc-800 hover:border-zinc-600'"
          type="button"
          @click="applyTemplate(item.id)"
        >
          <span class="block text-sm font-semibold">{{ item.name }}</span>
          <span class="mt-1 block text-xs text-zinc-400">{{ item.description }}</span>
        </button>
        <label v-if="store.project.templateId === 'seasonal'" class="block text-xs text-zinc-400">
          Season
          <select class="field mt-1" :value="store.project.season" @change="store.changeSeason(($event.target as HTMLSelectElement).value as SeasonId)">
            <option v-for="season in (Object.keys(SEASONS) as SeasonId[])" :key="season" :value="season">{{ season }}</option>
          </select>
        </label>
      </template>

      <template v-else-if="store.section === 'assets'">
        <FileDropZone accept="image/png,image/jpeg,image/webp,image/gif" label="Upload artwork" hint="PNG, JPEG, WebP, or GIF" @files="store.importImages($event, 'artwork')" />
        <p class="text-xs text-zinc-500">The same image is reused by asset id. It is not copied into the project JSON.</p>
      </template>

      <template v-else-if="store.section === 'text'">
        <button class="btn btn-primary w-full cursor-pointer" type="button" @click="store.addText()">Add text</button>
        <button v-if="store.mode === 'advanced'" class="btn btn-ghost w-full cursor-pointer" type="button" @click="store.addShape()">Add shape</button>
        <button
          v-for="layer in store.project.layers.filter((item) => item.kind === 'text')"
          :key="layer.id"
          class="block w-full cursor-pointer rounded border px-2 py-1 text-left text-sm"
          :class="store.selectedIds.includes(layer.id) ? 'border-amber-300' : 'border-zinc-800'"
          type="button"
          @click="store.selectOnly(layer.id)"
        >
          {{ layer.text || layer.name }}
        </button>
      </template>

      <template v-else-if="store.section === 'badges'">
        <div v-if="quality" class="flex items-center justify-between text-sm">
          <span>Quality</span>
          <ToggleSwitch
            :model-value="quality.visible"
            aria-label="Show quality badge"
            @update:model-value="(on) => { const layer = quality; if (layer && on !== layer.visible) store.toggleVisible(layer.id) }"
          />
        </div>
        <p v-if="quality" class="text-xs text-zinc-400">{{ badgeLabel(store.project, quality) }}</p>
        <div v-if="duration" class="flex items-center justify-between text-sm">
          <span>Duration</span>
          <ToggleSwitch
            :model-value="duration.visible"
            aria-label="Show duration badge"
            @update:model-value="(on) => { const layer = duration; if (layer && on !== layer.visible) store.toggleVisible(layer.id) }"
          />
        </div>
        <p v-if="duration" class="text-xs text-zinc-400">{{ badgeLabel(store.project, duration) || 'No duration yet' }}</p>
        <p class="pt-2 text-xs uppercase tracking-wide text-zinc-500">Optional badges</p>
        <button class="btn btn-ghost w-full cursor-pointer" type="button" @click="store.setContent(null)">None</button>
        <button
          v-for="badge in CONTENT_BADGES"
          :key="badge.id"
          class="btn w-full cursor-pointer"
          :class="content?.visible && content.contentBadge === badge.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="store.setContent(badge.id as ContentBadgeId)"
        >
          {{ badge.label }}
        </button>
        <button class="btn btn-ghost w-full cursor-pointer" type="button" @click="store.runAutoLayout()">Auto place badges</button>
        <div class="flex items-center justify-between text-sm">
          <span>Auto contrast</span>
          <ToggleSwitch
            :model-value="store.project.autoContrast"
            aria-label="Auto contrast"
            @update:model-value="store.setFlag('autoContrast', $event)"
          />
        </div>
      </template>

      <template v-else-if="store.section === 'backgrounds' && background">
        <label class="block text-xs text-zinc-400">
          Fill
          <select class="field mt-1" :value="background.boxStyle.fill" @change="store.selectOnly(background.id); store.patchPrimary({ boxStyle: { fill: ($event.target as HTMLSelectElement).value as 'solid' | 'gradient' | 'none' } })">
            <option value="solid">Solid</option>
            <option value="gradient">Gradient</option>
            <option value="none">Transparent</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">
          Color
          <input class="field mt-1" type="color" :value="background.boxStyle.color" @change="store.selectOnly(background.id); store.patchPrimary({ boxStyle: { color: ($event.target as HTMLInputElement).value } })" />
        </label>
        <label class="block text-xs text-zinc-400">
          Second color
          <input class="field mt-1" type="color" :value="background.boxStyle.color2" @change="store.selectOnly(background.id); store.patchPrimary({ boxStyle: { color2: ($event.target as HTMLInputElement).value } })" />
        </label>
        <label class="block text-xs text-zinc-400">
          Background blur
          <input class="mt-1 w-full" type="range" min="0" max="100" :value="background.blur" @change="store.selectOnly(background.id); store.patchPrimary({ blur: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <p class="text-xs text-zinc-500">Blur applies to the background layer only. Artwork stays sharp.</p>
      </template>

      <template v-else-if="store.section === 'frames'">
        <FileDropZone accept="image/png,image/webp" label="Upload frame PNG" hint="Transparent PNG recommended" @files="store.importImages($event, 'frame')" />
        <button
          v-if="store.project.layers.find((item) => item.kind === 'frame')?.assetId"
          class="btn btn-ghost w-full cursor-pointer"
          type="button"
          @click="store.toggleVisible(store.project.layers.find((item) => item.kind === 'frame')!.id)"
        >
          {{ store.project.layers.find((item) => item.kind === 'frame')?.visible ? 'Hide frame' : 'Show frame' }}
        </button>
      </template>

      <template v-else-if="store.section === 'presets'">
        <label class="block text-xs text-zinc-400">
          Preset name
          <input v-model="presetName" class="field mt-1" type="text" />
        </label>
        <button class="btn btn-primary w-full cursor-pointer" type="button" @click="store.savePreset(presetName)">Save preset</button>
        <button class="btn btn-ghost w-full cursor-pointer" type="button" @click="presetFile?.click()">Import JSON</button>
        <input ref="presetFile" class="hidden" type="file" accept="application/json" @change="onPresetFile" />
        <article v-for="preset in store.presets" :key="preset.id" class="rounded-md border border-zinc-800 p-2">
          <p class="text-sm font-semibold">{{ preset.name }}</p>
          <div class="mt-2 flex flex-wrap gap-1">
            <button class="btn btn-ghost cursor-pointer px-2 py-1 text-xs" type="button" @click="store.applyUserPreset(preset.id)">Apply</button>
            <button class="btn btn-ghost cursor-pointer px-2 py-1 text-xs" type="button" @click="store.duplicatePreset(preset.id)">Duplicate</button>
            <button class="btn btn-ghost cursor-pointer px-2 py-1 text-xs" type="button" @click="downloadPreset(preset.id)">Export</button>
            <button class="btn btn-ghost cursor-pointer px-2 py-1 text-xs" type="button" @click="store.setDefaultPreset(store.defaultPresetId === preset.id ? null : preset.id)">
              {{ store.defaultPresetId === preset.id ? 'Default' : 'Set default' }}
            </button>
            <button class="btn btn-danger cursor-pointer px-2 py-1 text-xs" type="button" @click="store.removePreset(preset.id)">Delete</button>
          </div>
          <input
            class="field mt-2 text-xs"
            :value="preset.name"
            aria-label="Rename preset"
            @change="store.renamePreset(preset.id, ($event.target as HTMLInputElement).value)"
          />
        </article>
      </template>

      <div v-if="store.mode === 'advanced'" class="border-t border-zinc-800 pt-3">
        <p class="mb-2 text-xs uppercase tracking-wide text-zinc-500">Layers</p>
        <button
          v-for="layer in [...store.project.layers].sort((a, b) => b.z - a.z)"
          :key="layer.id"
          class="mb-1 flex w-full cursor-pointer items-center justify-between rounded px-2 py-1 text-left text-sm"
          :class="store.selectedIds.includes(layer.id) ? 'bg-amber-300/15 text-amber-200' : 'hover:bg-zinc-800'"
          type="button"
          @click="store.selectOnly(layer.id)"
        >
          <span>{{ layer.name }}</span>
          <span class="text-xs text-zinc-500">{{ layer.visible ? '' : 'Hidden' }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>
