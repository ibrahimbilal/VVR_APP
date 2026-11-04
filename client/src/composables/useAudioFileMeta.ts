import { ref, watch, type Ref } from 'vue'

/** Loads duration from a local object URL (revoked URLs are ignored). */
export function useAudioFileMeta(previewUrl: Ref<string | null | undefined>) {
  const durationSec = ref<number | null>(null)

  watch(
    previewUrl,
    (url) => {
      durationSec.value = null
      if (!url) return
      const audio = new Audio()
      audio.preload = 'metadata'
      const onMeta = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) durationSec.value = audio.duration
      }
      audio.addEventListener('loadedmetadata', onMeta, { once: true })
      audio.addEventListener('error', () => {
        durationSec.value = null
      }, { once: true })
      audio.src = url
    },
    { immediate: true },
  )

  return { durationSec }
}
