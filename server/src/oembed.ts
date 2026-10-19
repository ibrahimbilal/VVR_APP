import { platformMessage, parseVideoUrl, type Platform } from '../../shared/urls'

export interface ImportLookup {
  ok: true
  platform: Platform
  url: string
  title: string | null
  thumbnail: string | null
  canDownload: false
  message: string
}

export async function lookupUrl(raw: string): Promise<ImportLookup | { ok: false; error: string }> {
  const parsed = parseVideoUrl(raw)
  if (!parsed.ok) return parsed

  if (parsed.platform === 'instagram') {
    return {
      ok: true,
      platform: 'instagram',
      url: parsed.normalizedUrl,
      title: null,
      thumbnail: null,
      canDownload: false,
      message: platformMessage('instagram'),
    }
  }

  const meta = await fetchOembed(parsed.platform, parsed.normalizedUrl)
  return {
    ok: true,
    platform: parsed.platform,
    url: parsed.normalizedUrl,
    title: meta?.title ?? null,
    thumbnail: meta?.thumbnail ?? null,
    canDownload: false,
    message: platformMessage(parsed.platform),
  }
}

async function fetchOembed(
  platform: 'youtube' | 'tiktok',
  videoUrl: string,
): Promise<{ title: string | null; thumbnail: string | null } | null> {
  const endpoint =
    platform === 'youtube'
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`
      : `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'VVR/1.0' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { title?: unknown; thumbnail_url?: unknown }
    return { title: safeTitle(data.title), thumbnail: safeThumb(data.thumbnail_url) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function safeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, 140) : null
}

function safeThumb(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}
