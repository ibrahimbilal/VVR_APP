import { DEFAULT_AUDIO_LOOPER_LIMITS, importExtension } from '@shared/audioLooper'

export function validateLooperAudioFile(file: File): string | null {
  const extension = importExtension(file.name)
  const typeOk = /^audio\//.test(file.type)
  if (!extension && !typeOk) return 'Choose an MP3, WAV, FLAC, M4A, AAC, or OGG file.'
  if (file.size < 64) return 'That audio file looks empty.'
  if (file.size > DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes) {
    return `Audio files must be ${DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes / (1024 * 1024)} MB or smaller.`
  }
  return null
}
