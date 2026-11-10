import { drawMotionFrame } from '@shared/imageMotion'
import { locatePlayhead, timelineDuration } from '@shared/imageMotionTimeline'
import { computed, effectScope, ref, watch } from 'vue'
import { useImageMotionStore } from '../stores/imageMotion'

type LoadedImage = {
  segmentId: string
  image: HTMLImageElement
  width: number
  height: number
}

let instance: ReturnType<typeof createImageMotionPlayback> | null = null

function createImageMotionPlayback() {
  const store = useImageMotionStore()
  const playing = ref(false)
  const playhead = ref(0)
  const muted = ref(false)
  const loaded = ref<Map<string, LoadedImage>>(new Map())
  const music = new Audio()
  music.preload = 'auto'
  music.loop = true
  let raf = 0
  let lastTick = 0

  const duration = computed(() => timelineDuration(store.segments))
  const location = computed(() => locatePlayhead(store.segments, playhead.value))

  watch(
    () => store.musicUrl,
    (url) => {
      if (!url) {
        music.pause()
        music.removeAttribute('src')
        return
      }
      music.src = url
    },
    { immediate: true },
  )

  watch(
    () => store.segments.map((s) => s.id).join(','),
    () => {
      void preloadAll()
    },
    { immediate: true },
  )

  watch(muted, (value) => {
    music.muted = value
  })

  watch(
    () => store.audio.musicVolume,
    (volume) => {
      music.volume = Math.min(1, Math.max(0, volume))
    },
    { immediate: true },
  )

  async function preloadAll() {
    const next = new Map<string, LoadedImage>()
    for (const segment of store.segments) {
      const url = store.objectUrlFor(segment.id)
      if (!url) continue
      const existing = loaded.value.get(segment.id)
      if (existing) {
        next.set(segment.id, existing)
        continue
      }
      const image = await decodeImage(url)
      if (image) {
        next.set(segment.id, {
          segmentId: segment.id,
          image,
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
      }
    }
    for (const [id, entry] of loaded.value) {
      if (!next.has(id)) {
        entry.image.src = ''
      }
    }
    loaded.value = next
  }

  function decodeImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = url
    })
  }

  function syncMusic() {
    if (!store.musicUrl || muted.value || store.audio.musicVolume <= 0) {
      music.pause()
      return
    }
    if (playing.value) {
      if (Math.abs(music.currentTime - playhead.value) > 0.35) music.currentTime = playhead.value
      void music.play().catch(() => undefined)
    } else {
      music.pause()
    }
  }

  function tick(now: number) {
    if (!playing.value) return
    if (!lastTick) lastTick = now
    const delta = (now - lastTick) / 1000
    lastTick = now
    const next = playhead.value + delta
    if (next >= duration.value) {
      playhead.value = 0
      playing.value = false
      music.pause()
      return
    }
    playhead.value = next
    syncMusic()
    raf = requestAnimationFrame(tick)
  }

  function play() {
    if (duration.value <= 0) return
    playing.value = true
    lastTick = 0
    syncMusic()
    raf = requestAnimationFrame(tick)
  }

  function pause() {
    playing.value = false
    cancelAnimationFrame(raf)
    music.pause()
  }

  function toggle() {
    if (playing.value) pause()
    else play()
  }

  function seek(time: number) {
    playhead.value = Math.min(Math.max(0, time), Math.max(0, duration.value - 1e-4))
    if (playing.value) syncMusic()
    else music.currentTime = playhead.value
  }

  function paint(canvas: HTMLCanvasElement | null) {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = store.video
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    const spot = location.value
    if (!spot) return

    const drawSegment = (index: number, progress: number, alpha = 1) => {
      const segment = store.segments[index]
      const decoded = segment ? loaded.value.get(segment.id) : null
      if (!segment || !decoded) return
      ctx.save()
      ctx.globalAlpha = alpha
      drawMotionFrame(ctx, decoded.image, decoded.width, decoded.height, width, height, segment.motion, progress)
      ctx.restore()
    }

    if (spot.crossfade) {
      drawSegment(spot.crossfade.fromIndex, spot.crossfade.fromProgress, 1 - spot.crossfade.blend)
      drawSegment(spot.crossfade.toIndex, spot.crossfade.toProgress, spot.crossfade.blend)
    } else {
      drawSegment(spot.segmentIndex, spot.localProgress)
    }
  }

  return {
    playing,
    playhead,
    muted,
    duration,
    location,
    play,
    pause,
    toggle,
    seek,
    paint,
    preloadAll,
  }
}

export function useImageMotionPlayback() {
  if (!instance) {
    const scope = effectScope(true)
    instance = scope.run(() => createImageMotionPlayback()) ?? null
  }
  if (!instance) throw new Error('Image motion preview failed to start.')
  return instance
}
