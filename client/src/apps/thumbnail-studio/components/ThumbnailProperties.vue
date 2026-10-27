<script setup lang="ts">
import { ANCHORS, normToPx, pxToNorm, type FixedAnchor } from '@shared/thumbnailLayout'
import { QUALITY_OPTIONS, THUMBNAIL_ASPECTS, THUMBNAIL_OUTPUTS, badgeLabel, type QualityId, type ThumbnailAspect } from '@shared/thumbnailProject'
import { computed } from 'vue'
import ToggleSwitch from '../../../components/ToggleSwitch.vue'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()
const layer = computed(() => store.primary)
const fonts = ['Inter, sans-serif', 'Oswald, sans-serif', 'Anton, sans-serif', '"Bebas Neue", sans-serif', 'Montserrat, sans-serif', 'Georgia, "Times New Roman", serif']

function setPosition(axis: 'x' | 'y', raw: string, mode: 'percent' | 'pixel'): void {
  const value = Number(raw)
  if (!Number.isFinite(value) || !layer.value) return
  const size = axis === 'x' ? store.project.width : store.project.height
  const next = mode === 'percent' ? value / 100 : pxToNorm(value, size)
  store.patchPrimary(axis === 'x' ? { x: next, anchor: 'free' } : { y: next, anchor: 'free' })
}
</script>

<template>
  <aside class="max-h-[42vh] shrink-0 space-y-3 overflow-y-auto border-t border-zinc-800 p-3 xl:max-h-none xl:w-72 xl:border-t-0 xl:border-l">
    <section class="space-y-2">
      <p class="text-xs uppercase tracking-wide text-zinc-500">Output</p>
      <select
        class="field"
        :value="`${store.project.width}x${store.project.height}`"
        @change="
          ($event.target as HTMLSelectElement).value === 'custom'
            ? store.changeOutput(store.project.width, store.project.height, 'custom')
            : store.changeOutput(Number(($event.target as HTMLSelectElement).value.split('x')[0]), Number(($event.target as HTMLSelectElement).value.split('x')[1]), '16:9')
        "
      >
        <option v-for="size in THUMBNAIL_OUTPUTS" :key="size.label" :value="`${size.width}x${size.height}`">{{ size.label }}</option>
        <option value="custom">Custom</option>
      </select>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-zinc-400">Width
          <input class="field mt-1" type="number" :value="store.project.width" @change="store.changeOutput(Number(($event.target as HTMLInputElement).value), store.project.height, 'custom')" />
        </label>
        <label class="text-xs text-zinc-400">Height
          <input class="field mt-1" type="number" :value="store.project.height" @change="store.changeOutput(store.project.width, Number(($event.target as HTMLInputElement).value), 'custom')" />
        </label>
      </div>
      <select class="field" :value="store.project.aspect" @change="store.changeOutput(store.project.width, store.project.height, ($event.target as HTMLSelectElement).value as ThumbnailAspect)">
        <option v-for="aspect in THUMBNAIL_ASPECTS" :key="aspect" :value="aspect">{{ aspect }}</option>
      </select>
      <label class="block text-xs text-zinc-400">Safe margin {{ Math.round(store.project.safeMargin * 100) }}%
        <input class="mt-1 w-full" type="range" min="0" max="0.15" step="0.005" :value="store.project.safeMargin" @change="store.setSafeMargin(Number(($event.target as HTMLInputElement).value))" />
      </label>
      <div class="flex items-center justify-between text-sm">
        <span>Safe area</span>
        <ToggleSwitch
          :model-value="store.project.showSafeArea"
          aria-label="Show safe area"
          @update:model-value="store.setFlag('showSafeArea', $event)"
        />
      </div>
      <div class="flex items-center justify-between text-sm">
        <span>Snap center</span>
        <ToggleSwitch
          :model-value="store.project.snapCenter"
          aria-label="Snap center"
          @update:model-value="store.setFlag('snapCenter', $event)"
        />
      </div>
      <div class="flex items-center justify-between text-sm">
        <span>Snap grid</span>
        <ToggleSwitch
          :model-value="store.project.snapGrid > 0"
          aria-label="Snap grid"
          @update:model-value="store.setSnapGrid($event ? 0.02 : 0)"
        />
      </div>
    </section>

    <section class="space-y-2 border-t border-zinc-800 pt-3">
      <p class="text-xs uppercase tracking-wide text-zinc-500">Artwork</p>
      <div class="flex flex-wrap gap-1">
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.setFit('contain')">Contain</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.setFit('cover')">Cover</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.zoomArtwork(1.1)">Zoom in</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.zoomArtwork(0.9)">Zoom out</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.resetCrop()">Reset crop</button>
      </div>
      <div class="grid grid-cols-3 gap-1">
        <span />
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.panArtwork(0, -0.02)">Up</button>
        <span />
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.panArtwork(-0.02, 0)">Left</button>
        <span />
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.panArtwork(0.02, 0)">Right</button>
        <span />
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.panArtwork(0, 0.02)">Down</button>
      </div>
    </section>

    <section v-if="layer" class="space-y-2 border-t border-zinc-800 pt-3">
      <p class="text-xs uppercase tracking-wide text-zinc-500">{{ layer.name }}</p>
      <p v-if="layer.kind === 'badge'" class="text-sm text-zinc-300">{{ badgeLabel(store.project, layer) }}</p>
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="anchor in ANCHORS"
          :key="anchor.id"
          class="btn cursor-pointer px-1 py-1 text-[10px]"
          :class="layer.anchor === anchor.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="anchor.id === 'free' ? store.patchPrimary({ anchor: 'free' }) : store.setAnchor(anchor.id as FixedAnchor)"
        >
          {{ anchor.label }}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-zinc-400">X %
          <input class="field mt-1" type="number" :value="Math.round(layer.x * 1000) / 10" @change="setPosition('x', ($event.target as HTMLInputElement).value, 'percent')" />
        </label>
        <label class="text-xs text-zinc-400">Y %
          <input class="field mt-1" type="number" :value="Math.round(layer.y * 1000) / 10" @change="setPosition('y', ($event.target as HTMLInputElement).value, 'percent')" />
        </label>
        <label class="text-xs text-zinc-400">X px
          <input class="field mt-1" type="number" :value="normToPx(layer.x, store.project.width)" @change="setPosition('x', ($event.target as HTMLInputElement).value, 'pixel')" />
        </label>
        <label class="text-xs text-zinc-400">Y px
          <input class="field mt-1" type="number" :value="normToPx(layer.y, store.project.height)" @change="setPosition('y', ($event.target as HTMLInputElement).value, 'pixel')" />
        </label>
      </div>
      <label class="block text-xs text-zinc-400">Opacity {{ Math.round(layer.opacity * 100) }}%
        <input class="mt-1 w-full" type="range" min="0" max="1" step="0.01" :value="layer.opacity" @change="store.patchPrimary({ opacity: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="block text-xs text-zinc-400">Rotation
        <input class="mt-1 w-full" type="range" min="-180" max="180" :value="layer.rotation" @change="store.patchPrimary({ rotation: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <div class="flex flex-wrap gap-1">
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.toggleVisible(layer.id)">{{ layer.visible ? 'Hide' : 'Show' }}</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.toggleLock(layer.id)">{{ layer.locked ? 'Unlock' : 'Lock' }}</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.duplicate()">Duplicate</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.bring(1)">Forward</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.bring(-1)">Backward</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.setAnchor('center')">Reset</button>
        <button class="btn btn-danger cursor-pointer" type="button" @click="store.removeSelected()">Delete</button>
      </div>
      <div v-if="store.selectedIds.length > 1" class="flex flex-wrap gap-1">
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.align('left')">Align left</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.align('center')">Align center</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.align('right')">Align right</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.align('top')">Align top</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.align('middle')">Align middle</button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.align('bottom')">Align bottom</button>
      </div>
      <template v-if="layer.kind === 'text' || layer.kind === 'badge'">
        <label class="block text-xs text-zinc-400">Text
          <input class="field mt-1" type="text" :value="layer.kind === 'badge' && layer.badgeRole !== 'content' ? badgeLabel(store.project, layer) : layer.text" @change="layer.badgeRole === 'duration' ? store.setDurationText(($event.target as HTMLInputElement).value) : layer.badgeRole === 'quality' ? store.setQualityText(($event.target as HTMLInputElement).value) : store.patchPrimary({ text: ($event.target as HTMLInputElement).value })" />
        </label>
        <label v-if="layer.badgeRole === 'quality'" class="block text-xs text-zinc-400">Quality
          <select class="field mt-1" @change="store.setQuality(($event.target as HTMLSelectElement).value as QualityId)">
            <option v-for="option in QUALITY_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">Font
          <select class="field mt-1" :value="layer.textStyle.fontFamily" @change="store.patchPrimary({ textStyle: { fontFamily: ($event.target as HTMLSelectElement).value } })">
            <option v-for="font in fonts" :key="font" :value="font">{{ font }}</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">Size
          <input class="mt-1 w-full" type="range" min="0.02" max="0.16" step="0.002" :value="layer.textStyle.fontSize" @change="store.patchPrimary({ textStyle: { fontSize: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Weight
          <input class="field mt-1" type="number" min="400" max="800" step="100" :value="layer.textStyle.fontWeight" @change="store.patchPrimary({ textStyle: { fontWeight: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Letter spacing
          <input class="mt-1 w-full" type="range" min="0" max="0.3" step="0.01" :value="layer.textStyle.letterSpacing" @change="store.patchPrimary({ textStyle: { letterSpacing: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Line height
          <input class="mt-1 w-full" type="range" min="0.8" max="1.6" step="0.05" :value="layer.textStyle.lineHeight" @change="store.patchPrimary({ textStyle: { lineHeight: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Align
          <select class="field mt-1" :value="layer.textStyle.align" @change="store.patchPrimary({ textStyle: { align: ($event.target as HTMLSelectElement).value as 'left' | 'center' | 'right' } })">
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">Text color
          <input class="field mt-1" type="color" :value="layer.textStyle.color.slice(0, 7)" @change="store.patchPrimary({ textStyle: { color: ($event.target as HTMLInputElement).value } })" />
        </label>
        <label class="block text-xs text-zinc-400">Stroke
          <input class="mt-1 w-full" type="range" min="0" max="0.01" step="0.0005" :value="layer.textStyle.strokeWidth" @change="store.patchPrimary({ textStyle: { strokeWidth: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Text shadow
          <input class="mt-1 w-full" type="range" min="0" max="0.04" step="0.001" :value="layer.textStyle.shadowBlur" @change="store.patchPrimary({ textStyle: { shadowBlur: Number(($event.target as HTMLInputElement).value), shadowY: 0.004 } })" />
        </label>
      </template>
      <template v-if="layer.kind !== 'artwork' && layer.kind !== 'frame'">
        <label class="block text-xs text-zinc-400">Fill
          <select class="field mt-1" :value="layer.boxStyle.fill" @change="store.patchPrimary({ boxStyle: { fill: ($event.target as HTMLSelectElement).value as 'solid' | 'gradient' | 'none' } })">
            <option value="solid">Solid</option>
            <option value="gradient">Gradient</option>
            <option value="none">None</option>
          </select>
        </label>
        <label class="block text-xs text-zinc-400">Fill color
          <input class="field mt-1" type="color" :value="layer.boxStyle.color.slice(0, 7)" @change="store.patchPrimary({ boxStyle: { color: ($event.target as HTMLInputElement).value } })" />
        </label>
        <label class="block text-xs text-zinc-400">Fill opacity
          <input class="mt-1 w-full" type="range" min="0" max="1" step="0.01" :value="layer.boxStyle.fillOpacity" @change="store.patchPrimary({ boxStyle: { fillOpacity: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Corner radius
          <input class="mt-1 w-full" type="range" min="0" max="0.08" step="0.002" :value="layer.boxStyle.radius" @change="store.patchPrimary({ boxStyle: { radius: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Border width
          <input class="mt-1 w-full" type="range" min="0" max="0.02" step="0.001" :value="layer.boxStyle.borderWidth" @change="store.patchPrimary({ boxStyle: { borderWidth: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Border color
          <input class="field mt-1" type="color" :value="layer.boxStyle.borderColor.slice(0, 7)" @change="store.patchPrimary({ boxStyle: { borderColor: ($event.target as HTMLInputElement).value } })" />
        </label>
        <label class="block text-xs text-zinc-400">Padding
          <input class="mt-1 w-full" type="range" min="0" max="0.06" step="0.002" :value="layer.boxStyle.padding" @change="store.patchPrimary({ boxStyle: { padding: Number(($event.target as HTMLInputElement).value) } })" />
        </label>
        <label class="block text-xs text-zinc-400">Drop shadow
          <input class="mt-1 w-full" type="range" min="0" max="0.08" step="0.002" :value="layer.boxStyle.shadowBlur" @change="store.patchPrimary({ boxStyle: { shadowBlur: Number(($event.target as HTMLInputElement).value), shadowY: 0.01, shadowColor: '#000000' } })" />
        </label>
        <label class="block text-xs text-zinc-400">Glow
          <input class="mt-1 w-full" type="range" min="0" max="0.08" step="0.002" :value="layer.boxStyle.glowBlur" @change="store.patchPrimary({ boxStyle: { glowBlur: Number(($event.target as HTMLInputElement).value), glowColor: '#e6c36a' } })" />
        </label>
      </template>
    </section>
    <p v-else class="text-sm text-zinc-500">Select a badge or text layer to edit it. Drag it on the canvas, or use the arrow keys.</p>
  </aside>
</template>
