<script setup lang="ts">
import { hitTestLayer, layerBox } from '@shared/thumbnailProject'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ensureThumbnailFonts, renderThumbnail } from '../lib/renderThumbnail'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()
const stage = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const display = ref({ width: 320, height: 180 })
let drag: { id: string; grabX: number; grabY: number } | null = null
let observer: ResizeObserver | null = null

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const rendered = renderThumbnail(store.project, store.renderAssets(), {
    maxEdge: 960,
    checker: true,
    safeArea: true,
    guides: { vertical: store.guideVertical, horizontal: store.guideHorizontal },
    selectedIds: [...store.selectedIds],
  })
  canvas.width = rendered.width
  canvas.height = rendered.height
  canvas.getContext('2d')?.drawImage(rendered, 0, 0)
  fit()
}

function fit(): void {
  const bounds = stage.value?.getBoundingClientRect()
  if (!bounds || bounds.width < 8 || bounds.height < 8) return
  const scale = Math.min(bounds.width / store.project.width, bounds.height / store.project.height) * store.zoom
  display.value = {
    width: Math.max(1, store.project.width * scale),
    height: Math.max(1, store.project.height * scale),
  }
}

function point(event: PointerEvent): { x: number; y: number } {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect || rect.width < 1 || rect.height < 1) return { x: 0, y: 0 }
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
}

function onPointerDown(event: PointerEvent): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const at = point(event)
  const hit = hitTestLayer(store.project.layers, at.x, at.y)
  if (!hit) {
    store.selectOnly(null)
    return
  }
  if (event.shiftKey) store.toggleSelect(hit.id)
  else store.selectOnly(hit.id)
  if (hit.locked) return
  const box = layerBox(hit)
  drag = { id: hit.id, grabX: at.x - (box.x + box.width / 2), grabY: at.y - (box.y + box.height / 2) }
  store.beginGesture()
  store.moveSelection(hit.id, box.x + box.width / 2, box.y + box.height / 2, false)
  canvas.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return
  const at = point(event)
  store.moveSelection(drag.id, at.x - drag.grabX, at.y - drag.grabY, true)
}

function onPointerUp(): void {
  if (!drag) return
  drag = null
  store.endGesture()
}

watch(
  () => [store.project, store.assetEpoch, store.selectedIds.join(','), store.guideVertical, store.guideHorizontal, store.zoom],
  () => draw(),
)

onMounted(async () => {
  await ensureThumbnailFonts()
  draw()
  observer = new ResizeObserver(() => fit())
  if (stage.value) observer.observe(stage.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="stage" class="relative grid min-h-[280px] flex-1 place-items-center overflow-auto bg-[#0c0d10] p-4">
    <canvas
      ref="canvasRef"
      class="max-w-full touch-none rounded-sm bg-transparent shadow-2xl"
      :style="{ width: `${display.width}px`, height: `${display.height}px` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <p v-if="store.missingAssets.length" class="absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 text-xs text-amber-200">
      An image used by this project is missing.
    </p>
  </div>
</template>
