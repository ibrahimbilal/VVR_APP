<script setup lang="ts">
import { frameMetrics } from '@shared/frame'
import { Pause, Play, SkipBack, SkipForward } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { usePlayback } from '../composables/usePlayback'
import { drawOverlay, ensureFonts } from '../lib/drawOverlay'
import { formatClock, formatRank, overlayRanks, pageLabel } from '../lib/format'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()
const {
  videoA,
  videoB,
  back,
  playing,
  playhead,
  duration,
  activeClip,
  activeIndex,
  segments,
  toggle,
  seek,
  next,
  previous,
  onVideoError,
  slotOpacity,
  slotZ,
} = usePlayback()

const wrap = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const scale = ref(0.3)
const fontsReady = ref(false)

const hasVideo = computed(() => store.clips.some((clip) => Boolean(clip.objectUrl)))
const metrics = computed(() => frameMetrics(store.style.video.width, store.style.video.height, store.style.banner.height))
const stageStyle = computed(() => ({
  width: `${metrics.value.width}px`,
  height: `${metrics.value.height}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}))
const scaleBoxStyle = computed(() => ({
  width: `${metrics.value.width * scale.value}px`,
  height: `${metrics.value.height * scale.value}px`,
}))
const videoBoxStyle = computed(() => {
  if (!hasVideo.value) {
    return {
      top: '0px',
      height: `${metrics.value.height}px`,
      background: '#000000',
    }
  }
  return {
    top: `${metrics.value.bannerHeight}px`,
    height: `${metrics.value.videoHeight}px`,
    background: store.style.video.scaleMode === 'crop' ? '#000000' : store.style.video.backgroundColor,
  }
})
const objectFit = computed(() => (store.style.video.scaleMode === 'crop' ? 'cover' : 'contain'))
const placeholder = computed(() => {
  if (!activeClip.value) return 'Add at least two videos.'
  if (!activeClip.value.objectUrl) return 'This slot needs a video file. Upload one you have permission to use.'
  if (activeClip.value.previewBlocked) return 'This browser cannot play this codec. Export can still try to render it.'
  return ''
})

function measure() {
  const box = wrap.value
  if (!box) return
  if (box.clientWidth < 20 || box.clientHeight < 20) return
  scale.value = Math.min(box.clientWidth / metrics.value.width, box.clientHeight / metrics.value.height)
}

function paint() {
  const target = canvas.value
  if (!target || !fontsReady.value) return
  const context = target.getContext('2d')
  if (!context) return
  target.width = metrics.value.width
  target.height = metrics.value.height
  if (!hasVideo.value) {
    context.clearRect(0, 0, target.width, target.height)
    return
  }
  const clip = activeClip.value
  const index = activeIndex.value
  drawOverlay(context, {
    width: metrics.value.width,
    height: metrics.value.height,
    bannerHeight: metrics.value.bannerHeight,
    banner: store.style.banner,
    spans: store.spans,
    ranking: store.style.ranking,
    caption: store.style.caption,
    ranks: overlayRanks(
      store.clips,
      index,
      store.style.ranking.format,
      store.style.ranking.color,
      store.style.caption.enabled && Boolean(clip?.objectUrl),
      store.style.ranking.display,
      store.style.caption.color,
      store.style.ranking.pageStyle,
    ),
  })
}

onMounted(async () => {
  await ensureFonts()
  fontsReady.value = true
  measure()
  paint()
  const box = wrap.value
  if (box) {
    const observer = new ResizeObserver(() => measure())
    observer.observe(box)
  }
  await nextTick()
  if (segments.value.length > 0) void seek(0)
})

watch(metrics, () => {
  measure()
  paint()
})
watch(
  () => [
    store.spans,
    store.style.banner,
    store.style.ranking,
    store.style.caption,
    activeIndex.value,
    store.clips.map((clip) => `${clip.title}\n${clip.rankColor ?? ''}\n${clip.titleColor ?? ''}\n${clip.objectUrl ? '1' : '0'}`).join('\n'),
  ],
  () => paint(),
  { deep: true },
)

function onSeek(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  void seek(Number(target.value))
}
</script>

<template>
  <section class="flex min-h-0 flex-col bg-[#0b0c0f]">
    <div ref="wrap" class="flex min-h-0 flex-1 items-center justify-center p-4">
      <div :style="scaleBoxStyle">
        <div class="relative cursor-pointer bg-black shadow-2xl ring-1 ring-white/10" :style="stageStyle" title="Play or pause" @click="toggle">
          <div class="absolute left-0 z-0 w-full overflow-hidden" :style="videoBoxStyle">
            <div v-if="placeholder" class="absolute inset-0 z-0 flex items-center justify-center px-16 text-center text-[42px] leading-snug text-zinc-400">
              {{ placeholder }}
            </div>
            <video
              ref="back"
              class="absolute inset-0 h-full w-full origin-center scale-110 object-cover blur-2xl"
              :class="store.style.video.scaleMode === 'blur' ? '' : 'hidden'"
              muted
              playsinline
            ></video>
            <video
              ref="videoA"
              class="absolute inset-0 h-full w-full"
              :class="hasVideo ? '' : 'hidden'"
              :style="{ objectFit, opacity: slotOpacity('a'), zIndex: slotZ('a') }"
              playsinline
              @error="onVideoError"
            ></video>
            <video
              ref="videoB"
              class="absolute inset-0 h-full w-full"
              :class="hasVideo ? '' : 'hidden'"
              :style="{ objectFit, opacity: slotOpacity('b'), zIndex: slotZ('b') }"
              playsinline
              @error="onVideoError"
            ></video>
          </div>
          <canvas ref="canvas" class="pointer-events-none absolute inset-0 z-10 h-full w-full"></canvas>
        </div>
      </div>
    </div>

    <div class="border-t border-zinc-800 px-4 py-3">
      <div class="mb-2 flex items-center gap-2">
        <button class="btn cursor-pointer btn-ghost px-2" type="button" aria-label="Previous clip" title="Previous clip" @click="previous">
          <SkipBack :size="16" />
        </button>
        <button class="btn cursor-pointer btn-primary px-3" type="button" :aria-label="playing ? 'Pause' : 'Play'" :title="playing ? 'Pause' : 'Play'" @click="toggle">
          <Pause v-if="playing" :size="16" />
          <Play v-else :size="16" />
        </button>
        <button class="btn cursor-pointer btn-ghost px-2" type="button" aria-label="Next clip" title="Next clip" @click="next">
          <SkipForward :size="16" />
        </button>
        <input
          class="mx-2 min-w-0 flex-1 cursor-pointer"
          type="range"
          min="0"
          :max="Math.max(duration, 0.01)"
          step="0.01"
          :value="Math.min(playhead, duration)"
          :disabled="duration <= 0"
          @input="onSeek"
        />
        <span class="w-24 shrink-0 text-right text-xs tabular-nums text-zinc-300">
          {{ formatClock(playhead) }} / {{ formatClock(duration) }}
        </span>
      </div>
      <div class="flex items-center justify-between gap-3 text-xs text-zinc-400">
        <p class="truncate">
          <template v-if="activeClip && activeIndex >= 0">
            <span class="text-amber-300">{{ store.style.ranking.display === 'page' && store.style.ranking.pageStyle !== 'number' ? `${pageLabel(activeIndex, store.clips.length)}` : `${formatRank(activeIndex, store.style.ranking.format)}` }}</span>
            {{ activeClip.title }}
          </template>
          <template v-else>Nothing playing yet</template>
        </p>
        <p class="shrink-0 tabular-nums">{{ metrics.width }}×{{ metrics.height }} · {{ store.style.video.fps }} fps · 9:16</p>
      </div>
    </div>
  </section>
</template>
