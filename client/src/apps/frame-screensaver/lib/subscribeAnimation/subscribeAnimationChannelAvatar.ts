import { isAllowedYoutubeAvatarUrl, isYoutubeAvatarDataUrl } from '@shared/youtubeAvatar'

let loadedUrl: string | null = null
let loadedImage: HTMLImageElement | null = null
let loadPromise: Promise<HTMLImageElement | null> | null = null
let loadedBlobUrl: string | null = null

function revokeLoadedBlobUrl(): void {
  if (loadedBlobUrl) {
    URL.revokeObjectURL(loadedBlobUrl)
    loadedBlobUrl = null
  }
}

function dataUrlToObjectUrl(dataUrl: string): string | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!match) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: match[1] }))
    return objectUrl
  } catch {
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

async function resolveAvatarSrc(remoteOrLegacyUrl: string, embeddedDataUrl?: string | null): Promise<string | null> {
  if (embeddedDataUrl && isYoutubeAvatarDataUrl(embeddedDataUrl)) {
    return dataUrlToObjectUrl(embeddedDataUrl)
  }
  const url = remoteOrLegacyUrl.trim()
  if (isYoutubeAvatarDataUrl(url)) {
    return dataUrlToObjectUrl(url)
  }
  if (!isAllowedYoutubeAvatarUrl(url)) return null
  try {
    const response = await fetch(`/api/youtube-channel-avatar?url=${encodeURIComponent(url)}`)
    if (!response.ok) return null
    const blob = await response.blob()
    if (blob.size < 32) return null
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export function getSubscribeChannelAvatarForSettings(settingsUrl: string | null | undefined): HTMLImageElement | null {
  if (!settingsUrl?.trim() || !loadedImage || loadedUrl !== settingsUrl.trim()) return null
  return loadedImage
}

export function clearSubscribeChannelAvatarCache(): void {
  loadedUrl = null
  loadedImage = null
  loadPromise = null
  revokeLoadedBlobUrl()
}

async function loadAvatarForSettingsKey(
  settingsKey: string,
  embeddedDataUrl?: string | null,
): Promise<HTMLImageElement | null> {
  revokeLoadedBlobUrl()
  const src = await resolveAvatarSrc(settingsKey, embeddedDataUrl)
  if (!src) return null
  loadedBlobUrl = src.startsWith('blob:') ? src : null
  return loadImage(src)
}

/** After YouTube lookup: draw from `avatarDataUrl` but key the cache on the CDN `avatarUrl`. */
export async function ingestSubscribeChannelAvatar(
  settingsKey: string | null | undefined,
  avatarDataUrl: string | null | undefined,
): Promise<void> {
  const key = settingsKey?.trim() || null
  if (!key) {
    clearSubscribeChannelAvatarCache()
    return
  }
  if (key === loadedUrl && loadedImage) return
  if (key === loadedUrl && loadPromise) {
    await loadPromise
    return
  }
  loadedUrl = key
  loadedImage = null
  loadPromise = loadAvatarForSettingsKey(key, avatarDataUrl)
  loadedImage = await loadPromise
  loadPromise = null
}

export async function preloadSubscribeChannelAvatar(url: string | null | undefined): Promise<void> {
  const next = url?.trim() || null
  if (!next) {
    clearSubscribeChannelAvatarCache()
    return
  }
  if (isYoutubeAvatarDataUrl(next)) {
    await ingestSubscribeChannelAvatar('legacy-data-url', next)
    return
  }
  await ingestSubscribeChannelAvatar(next, null)
}
