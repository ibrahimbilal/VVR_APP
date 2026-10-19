export interface LocalVideoMeta {
  duration: number
  width: number
  height: number
  thumbnail: string | null
}

export function validateVideoFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const extensionOk = extension === 'mp4' || extension === 'mov' || extension === 'webm' || extension === 'm4v'
  const typeOk = /^video\/(mp4|quicktime|webm|x-m4v)$/.test(file.type)
  if (!extensionOk && !typeOk) return `${file.name} is not an MP4, MOV, or WebM file.`
  if (file.size < 1024) return `${file.name} looks empty.`
  if (file.size > 500 * 1024 * 1024) return `${file.name} is larger than 500 MB.`
  return null
}

export function validateAudioFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const extensionOk = ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(extension)
  const typeOk = /^audio\//.test(file.type)
  if (!extensionOk && !typeOk) return 'Background music must be an MP3, WAV, M4A, AAC, or OGG file.'
  if (file.size > 40 * 1024 * 1024) return 'Background music must be 40 MB or smaller.'
  return null
}

export function readVideoFile(objectUrl: string): Promise<LocalVideoMeta | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    let settled = false
    const finish = (value: LocalVideoMeta | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.onloadedmetadata = null
      video.onseeked = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), 8000)
    video.onerror = () => finish(null)
    video.onloadedmetadata = () => {
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(null)
        return
      }
      const width = video.videoWidth
      const height = video.videoHeight
      video.onseeked = () => {
        let thumbnail: string | null = null
        try {
          if (width > 0 && height > 0) {
            const canvas = document.createElement('canvas')
            canvas.width = 160
            canvas.height = Math.max(90, Math.round((height / width) * 160))
            const context = canvas.getContext('2d')
            if (context) {
              context.drawImage(video, 0, 0, canvas.width, canvas.height)
              thumbnail = canvas.toDataURL('image/jpeg', 0.72)
            }
          }
        } catch {
          thumbnail = null
        }
        finish({ duration, width, height, thumbnail })
      }
      try {
        video.currentTime = Math.min(0.2, duration / 2)
      } catch {
        finish({ duration, width, height, thumbnail: null })
      }
    }
    video.src = objectUrl
  })
}
