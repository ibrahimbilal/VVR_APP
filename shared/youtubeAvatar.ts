/** HTTPS avatar URLs that the renderer may proxy (YouTube channel thumbnails). */

export function isAllowedYoutubeAvatarUrl(raw: string): boolean {
  const url = raw.trim()
  if (!url || url.length > 500) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    if (host === 'i.ytimg.com' || host === 'yt3.ggpht.com') return true
    if (host.endsWith('.googleusercontent.com')) return true
    return false
  } catch {
    return false
  }
}

export function isYoutubeAvatarDataUrl(value: string): boolean {
  return value.startsWith('data:image/')
}
