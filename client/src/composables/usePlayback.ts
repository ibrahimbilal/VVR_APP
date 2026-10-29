import { clipDuration, resolveFade } from '@shared/timeline'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { playbackOrder } from '../lib/order'
import { useProjectStore } from '../stores/project'
import type { Clip } from '../types'

export interface Segment {
  index: number
  clip: Clip
  duration: number
  start: number
}

type Slot = 'a' | 'b'

function createPlayback() {
  const store = useProjectStore()
  const videoA = ref<HTMLVideoElement | null>(null)
  const videoB = ref<HTMLVideoElement | null>(null)
  const back = ref<HTMLVideoElement | null>(null)
  const playing = ref(false)
  const muted = ref(false)
  const playhead = ref(0)
  const primarySlot = ref<Slot>('a')
  const secondarySlot = ref<Slot | null>(null)
  const secondaryOpacity = ref(0)
  let primarySegment = 0
  let secondarySegment = -1
  let busy = false
  let looping = false
  let secondaryLoading = false
  const music = new Audio()
  music.preload = 'auto'
  music.loop = true

  const playable = computed(() =>
    playbackOrder(store.clips)
      .map((clip) => ({
        clip,
        index: store.clips.findIndex((item) => item.id === clip.id),
        duration: clip.objectUrl ? clipDuration(clip) : 0,
      }))
      .filter((item) => item.duration >= 0.05),
  )
  const fade = computed(() =>
    resolveFade(
      playable.value.map((item) => item.duration),
      store.style.video.transition,
      store.style.video.fadeDuration,
    ),
  )
  const segments = computed<Segment[]>(() => {
    let start = 0
    return playable.value.map((item, index) => {
      const segment = { index: item.index, clip: item.clip, duration: item.duration, start }
      start += item.duration - (index < playable.value.length - 1 ? fade.value : 0)
      return segment
    })
  })
  const duration = computed(() => {
    const list = segments.value
    const last = list[list.length - 1]
    return last ? last.start + last.duration : 0
  })
  const location = computed(() => locate(playhead.value))
  const activeClip = computed(() => location.value?.segment.clip ?? null)
  const activeIndex = computed(() => location.value?.segment.index ?? -1)
  const clipLocalTime = computed(() => location.value?.local ?? 0)

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
  )
  watch(
    () => segments.value.map((segment) => `${segment.index}:${segment.clip.id}`).join('|'),
    (next, previous) => {
      if (!next) {
        clearStage()
        return
      }
      if (primarySegment >= segments.value.length) primarySegment = 0
      if (next === previous) return
      const spot = locate(playhead.value)
      const loaded = element(primarySlot.value)?.dataset.clipId
      if (!loaded || loaded !== spot?.segment.clip.id) {
        void seek(Math.min(playhead.value, Math.max(0, duration.value - 0.01)))
      }
    },
  )

  onBeforeUnmount(() => {
    playing.value = false
    music.pause()
  })

  function locate(time: number) {
    const list = segments.value
    if (list.length === 0) return null
    const clamped = Math.max(0, Math.min(time, Math.max(0, duration.value - 0.001)))
    for (let index = 0; index < list.length; index += 1) {
      const segment = list[index]
      if (!segment) continue
      const end = segment.start + segment.duration
      const last = index === list.length - 1
      if (clamped < end || last) {
        const local = Math.min(segment.duration, Math.max(0, clamped - segment.start))
        const fadeStart = end - fade.value
        const fading = !last && fade.value > 0 && clamped >= fadeStart
        const next = fading ? (list[index + 1] ?? null) : null
        return {
          segment,
          segmentIndex: index,
          local,
          next,
          nextLocal: next ? Math.max(0, clamped - next.start) : 0,
          fadeOut: fading && fade.value > 0 ? Math.min(1, (clamped - fadeStart) / fade.value) : 0,
        }
      }
    }
    return null
  }

  async function seek(time: number) {
    const spot = locate(time)
    if (!spot) {
      clearStage()
      return
    }
    playhead.value = Math.max(0, Math.min(time, duration.value))
    primarySegment = spot.segmentIndex
    await assign(primarySlot.value, spot.segment, spot.local, playing.value)
    if (spot.next && spot.fadeOut > 0) {
      const slot: Slot = primarySlot.value === 'a' ? 'b' : 'a'
      secondarySlot.value = slot
      secondarySegment = spot.segmentIndex + 1
      secondaryOpacity.value = spot.fadeOut
      await assign(slot, spot.next, spot.nextLocal, playing.value)
    } else {
      clearSecondary()
    }
    syncMusic(true)
    syncBack()
  }

  async function play() {
    if (segments.value.length === 0) return
    if (playhead.value >= duration.value - 0.05) playhead.value = 0
    playing.value = true
    await seek(playhead.value)
    ensureLoop()
  }

  function pause() {
    playing.value = false
    pauseMedia()
  }

  function toggle() {
    if (playing.value) pause()
    else void play()
  }

  function toggleMute() {
    muted.value = !muted.value
    syncVolumes()
    syncMusic(false)
  }

  function next() {
    const spot = locate(playhead.value)
    if (!spot) return
    const following = segments.value[spot.segmentIndex + 1]
    void seek(following ? following.start : duration.value)
  }

  function previous() {
    const spot = locate(playhead.value)
    if (!spot) return
    if (spot.local > 0.75) {
      void seek(spot.segment.start)
      return
    }
    const prior = segments.value[spot.segmentIndex - 1]
    void seek(prior ? prior.start : 0)
  }

  function onVideoError(event: Event) {
    const video = event.target
    if (!(video instanceof HTMLVideoElement)) return
    const id = video.dataset.clipId
    const clip = store.clips.find((item) => item.id === id)
    if (clip?.objectUrl) clip.previewBlocked = true
  }

  function slotOpacity(slot: Slot): number {
    if (slot === secondarySlot.value) return secondaryOpacity.value
    if (slot === primarySlot.value) return 1
    return 0
  }

  function slotZ(slot: Slot): number {
    if (slot === secondarySlot.value) return 3
    if (slot === primarySlot.value) return 2
    return 1
  }

  function ensureLoop() {
    if (looping) return
    looping = true
    const step = () => {
      if (!playing.value) {
        looping = false
        return
      }
      tick()
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  function tick() {
    const video = element(primarySlot.value)
    const segment = segments.value[primarySegment]
    if (!video || !segment) return
    const local = video.currentTime - segment.clip.trimStart
    if (Number.isFinite(local) && local >= -0.05) {
      playhead.value = Math.min(duration.value, segment.start + Math.max(0, local))
    }
    const nextSegment = segments.value[primarySegment + 1]
    const lead = Math.max(fade.value, 0.75)
    if (nextSegment && local >= segment.duration - lead) {
      void ensureSecondary(primarySegment + 1, Math.max(0, local - (segment.duration - fade.value)))
    }
    if (nextSegment && fade.value > 0 && local >= segment.duration - fade.value) {
      secondaryOpacity.value = Math.min(1, (local - (segment.duration - fade.value)) / fade.value)
    }
    syncVolumes()
    syncBack()
    syncMusic(false)
    if (local >= segment.duration - 0.045) void advance()
  }

  async function advance() {
    if (busy) return
    busy = true
    try {
      const nextSegment = segments.value[primarySegment + 1]
      if (!nextSegment) {
        playing.value = false
        playhead.value = duration.value
        pauseMedia()
        return
      }
      if (secondarySegment === primarySegment + 1 && secondarySlot.value) {
        const promoted = secondarySlot.value
        const previous = primarySlot.value
        secondarySlot.value = null
        secondarySegment = -1
        secondaryOpacity.value = 0
        primarySlot.value = promoted
        primarySegment += 1
        if (previous !== promoted) element(previous)?.pause()
        return
      }
      primarySegment += 1
      clearSecondary()
      await assign(primarySlot.value, nextSegment, 0, true)
    } finally {
      busy = false
    }
  }

  async function ensureSecondary(index: number, local: number) {
    if (secondarySegment === index || secondaryLoading) return
    const segment = segments.value[index]
    if (!segment) return
    secondaryLoading = true
    try {
      const slot: Slot = primarySlot.value === 'a' ? 'b' : 'a'
      secondarySlot.value = slot
      secondarySegment = index
      if (secondaryOpacity.value === 0 && fade.value === 0) secondaryOpacity.value = 0
      await assign(slot, segment, Math.max(0, local), playing.value)
    } finally {
      secondaryLoading = false
    }
  }

  function unload(video: HTMLVideoElement | null) {
    if (!video) return
    video.pause()
    delete video.dataset.clipId
    video.removeAttribute('src')
    video.src = ''
    video.load()
  }

  function clearStage() {
    playing.value = false
    playhead.value = 0
    primarySegment = 0
    secondarySlot.value = null
    secondarySegment = -1
    secondaryOpacity.value = 0
    unload(videoA.value)
    unload(videoB.value)
    unload(back.value)
    music.pause()
  }

  function clearSecondary() {
    const slot = secondarySlot.value
    secondarySlot.value = null
    secondarySegment = -1
    secondaryOpacity.value = 0
    if (slot) element(slot)?.pause()
  }

  async function assign(slot: Slot, segment: Segment, local: number, shouldPlay: boolean) {
    const video = element(slot)
    if (!video || !segment.clip.objectUrl) return
    video.playsInline = true
    if (video.dataset.clipId !== segment.clip.id) await loadSource(video, segment.clip.objectUrl, segment.clip.id)
    const target = Math.min(Math.max(0, segment.clip.trimEnd - 0.02), segment.clip.trimStart + Math.max(0, local))
    if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.08) await seekElement(video, target)
    syncVolumes()
    if (shouldPlay) {
      try {
        await video.play()
      } catch {
        playing.value = false
      }
    } else {
      video.pause()
    }
  }

  function syncVolumes() {
    for (const slot of ['a', 'b'] as const) {
      const video = element(slot)
      if (!video) continue
      if (muted.value || !store.style.video.keepAudio) {
        video.muted = true
        continue
      }
      video.muted = false
      const base = store.style.video.originalVolume
      if (slot === primarySlot.value) video.volume = base * (1 - secondaryOpacity.value * 0.85)
      else if (slot === secondarySlot.value) video.volume = base * secondaryOpacity.value
      else video.volume = 0
    }
  }

  function syncBack() {
    const backVideo = back.value
    const primary = element(primarySlot.value)
    if (!backVideo || !primary) return
    if (store.style.video.scaleMode !== 'blur') {
      backVideo.pause()
      return
    }
    if (primary.dataset.clipId && backVideo.dataset.clipId !== primary.dataset.clipId) {
      backVideo.src = primary.currentSrc || primary.src
      backVideo.dataset.clipId = primary.dataset.clipId
    }
    if (primary.readyState >= 1 && Math.abs(backVideo.currentTime - primary.currentTime) > 0.12) {
      backVideo.currentTime = primary.currentTime
    }
    if (playing.value && backVideo.paused) void backVideo.play().catch(() => undefined)
  }

  function syncMusic(force: boolean) {
    music.volume = store.style.video.musicVolume
    if (muted.value || !playing.value || !store.musicUrl || store.style.video.musicVolume <= 0) {
      music.pause()
      return
    }
    if (music.paused) void music.play().catch(() => undefined)
    if (!music.duration || !Number.isFinite(music.duration)) return
    const target = playhead.value % music.duration
    if (force || Math.abs(music.currentTime - target) > 0.4) music.currentTime = target
  }

  function element(slot: Slot): HTMLVideoElement | null {
    return slot === 'a' ? videoA.value : videoB.value
  }

  function pauseMedia() {
    videoA.value?.pause()
    videoB.value?.pause()
    back.value?.pause()
    music.pause()
  }

  return {
    videoA,
    videoB,
    back,
    playing,
    muted,
    playhead,
    duration,
    activeClip,
    activeIndex,
    clipLocalTime,
    segments,
    secondaryOpacity,
    toggle,
    toggleMute,
    play,
    pause,
    seek,
    next,
    previous,
    onVideoError,
    slotOpacity,
    slotZ,
  }
}

function loadSource(video: HTMLVideoElement, url: string, clipId: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, 4000)
    video.addEventListener('loadeddata', finish, { once: true })
    video.addEventListener('error', finish, { once: true })
    video.src = url
    video.dataset.clipId = clipId
  })
}

function seekElement(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, 2000)
    video.addEventListener('seeked', finish, { once: true })
    try {
      video.currentTime = time
    } catch {
      finish()
    }
  })
}

let sharedPlayback: ReturnType<typeof createPlayback> | null = null

export function usePlayback() {
  if (!sharedPlayback) sharedPlayback = createPlayback()
  return sharedPlayback
}
