import { isAllowedYoutubeAvatarUrl } from '../../shared/youtubeAvatar'

const MAX_AVATAR_BYTES = 512 * 1024
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_MAX = 48

type CacheEntry = { dataUrl: string; fetchedAt: number }

const avatarCache = new Map<string, CacheEntry>()

export async function fetchYoutubeAvatarDataUrl(remoteUrl: string): Promise<string | null> {
  if (!isAllowedYoutubeAvatarUrl(remoteUrl)) return null

  const cached = avatarCache.get(remoteUrl)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.dataUrl

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(remoteUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Mozilla/5.0 (compatible; RiboStudio/1.0; +https://github.com/ibrahimbilal/ribo-studio)',
      },
    })
    if (response.status === 429 || !response.ok) return null

    const type = response.headers.get('content-type') ?? 'image/jpeg'
    if (!type.startsWith('image/')) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length < 32 || buffer.length > MAX_AVATAR_BYTES) return null

    const dataUrl = `data:${type.split(';')[0]};base64,${buffer.toString('base64')}`
    avatarCache.set(remoteUrl, { dataUrl, fetchedAt: Date.now() })
    while (avatarCache.size > CACHE_MAX) {
      const oldest = avatarCache.keys().next().value
      if (oldest === undefined) break
      avatarCache.delete(oldest)
    }
    return dataUrl
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function proxyYoutubeAvatarResponse(remoteUrl: string): Promise<{ body: Buffer; contentType: string } | null> {
  const dataUrl = await fetchYoutubeAvatarDataUrl(remoteUrl)
  if (!dataUrl) return null
  const match = /^data:(image\/[^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  return { contentType: match[1], body: Buffer.from(match[2], 'base64') }
}
