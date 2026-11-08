import { parseVideoUrl } from '../../shared/urls'
import { parseYoutubeChannelPageUrl } from '../../shared/youtubeChannel'
import { fetchYoutubeAvatarDataUrl } from './youtubeAvatar'

export interface YoutubeChannelLookupResult {
  ok: true
  channelName: string | null
  channelUrl: string | null
  /** YouTube CDN URL only (safe for editor state and export JSON). */
  avatarUrl: string | null
  /** Proxied image for immediate client draw; not stored in project settings. */
  avatarDataUrl: string | null
  subscriberCount: string | null
  source: 'video-oembed' | 'channel-page'
}

export async function lookupYoutubeChannel(
  raw: string,
): Promise<YoutubeChannelLookupResult | { ok: false; error: string }> {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'Paste a YouTube link first.' }

  const video = parseVideoUrl(trimmed)
  if (video.ok && video.platform === 'youtube') {
    const meta = await fetchYoutubeOembed(video.normalizedUrl)
    if (!meta?.author_name) {
      return { ok: false, error: 'Could not read channel info from that video link.' }
    }
    let avatarUrl: string | null = null
    let avatarDataUrl: string | null = null
    let subscriberCount: string | null = null
    if (meta.author_url) {
      const page = await fetchChannelPage(meta.author_url)
      if (page) {
        const assets = await resolveAvatarAssets(page.avatarUrl)
        avatarUrl = assets.avatarUrl
        avatarDataUrl = assets.avatarDataUrl
        subscriberCount = page.subscriberCount
      }
    }
    return {
      ok: true,
      channelName: meta.author_name,
      channelUrl: meta.author_url,
      avatarUrl,
      avatarDataUrl,
      subscriberCount,
      source: 'video-oembed',
    }
  }

  const channel = parseYoutubeChannelPageUrl(trimmed)
  if (!channel.ok) return channel

  const page = await fetchChannelPage(channel.normalizedUrl)
  if (!page) return { ok: false, error: 'Could not load that YouTube channel page.' }

  const assets = await resolveAvatarAssets(page.avatarUrl)
  return {
    ok: true,
    channelName: page.title,
    channelUrl: channel.normalizedUrl,
    avatarUrl: assets.avatarUrl,
    avatarDataUrl: assets.avatarDataUrl,
    subscriberCount: page.subscriberCount,
    source: 'channel-page',
  }
}

async function resolveAvatarAssets(
  remoteUrl: string | null,
): Promise<{ avatarUrl: string | null; avatarDataUrl: string | null }> {
  if (!remoteUrl) return { avatarUrl: null, avatarDataUrl: null }
  const avatarDataUrl = await fetchYoutubeAvatarDataUrl(remoteUrl)
  return { avatarUrl: remoteUrl, avatarDataUrl }
}

async function fetchYoutubeOembed(
  videoUrl: string,
): Promise<{ author_name: string | null; author_url: string | null } | null> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'VVR/1.0' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { author_name?: unknown; author_url?: unknown }
    const author_name = safeText(data.author_name, 120)
    const author_url = safeHttpUrl(data.author_url)
    return { author_name, author_url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchChannelPage(
  pageUrl: string,
): Promise<{ title: string | null; avatarUrl: string | null; subscriberCount: string | null } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; VVR/1.0; +https://videos.ibrahimbilal.com)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!response.ok) return null
    const html = await response.text()
    return parseChannelPageHtml(html)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseChannelPageHtml(html: string): { title: string | null; avatarUrl: string | null; subscriberCount: string | null } {
  const ogTitle =
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ??
    html.match(/name="title"\s+content="([^"]+)"/i)?.[1] ??
    null
  let title = ogTitle ? decodeHtmlEntities(ogTitle).replace(/\s*-\s*YouTube\s*$/i, '').trim() : null
  if (title && title.length > 120) title = title.slice(0, 120)

  const avatarMatch =
    html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/"thumbnail"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/)?.[1]
  const avatarUrl = avatarMatch ? safeHttpUrl(unescapeJsonUrl(avatarMatch)) : null
  const subscriberCount = parseSubscriberCountText(html)

  return { title: title || null, avatarUrl, subscriberCount }
}

function parseSubscriberCountText(html: string): string | null {
  const simple = html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/)?.[1]
  if (simple) {
    const text = decodeHtmlEntities(simple).trim()
    return text ? text.slice(0, 48) : null
  }
  const runCount = html.match(
    /"subscriberCountText"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"\s*\}\s*,\s*\{\s*"text"\s*:\s*" subscribers"/,
  )?.[1]
  if (runCount) {
    return `${decodeHtmlEntities(runCount).trim()} subscribers`.slice(0, 48)
  }

  const metaContent = html.match(
    /"metadataParts"\s*:\s*\[\s*\{\s*"text"\s*:\s*\{\s*"content"\s*:\s*"([^"]*subscribers[^"]*)"/i,
  )?.[1]
  if (metaContent) {
    const text = decodeHtmlEntities(metaContent).trim()
    if (text) return text.slice(0, 48)
  }

  const content = html.match(/"content"\s*:\s*"([\d][^"]*subscribers)"/i)?.[1]
  if (content) {
    const text = decodeHtmlEntities(content).trim()
    if (text) return text.slice(0, 48)
  }

  return null
}

function unescapeJsonUrl(value: string): string {
  return value.replace(/\\u0026/g, '&').replace(/\\\//g, '/')
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, max) : null
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}
