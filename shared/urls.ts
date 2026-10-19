export type Platform = 'youtube' | 'tiktok' | 'instagram'

export type ParsedUrl =
  | { ok: true; platform: Platform; normalizedUrl: string }
  | { ok: false; error: string }

const YOUTUBE_ID = /^[\w-]{11}$/

export function platformMessage(platform: Platform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube does not allow this app to download videos. Upload the video file if you have permission to use it.'
    case 'tiktok':
      return 'TikTok does not allow this app to download videos. Upload the video file if you have permission to use it.'
    case 'instagram':
      return 'Instagram does not provide a download API for this app. Upload the video file if you have permission to use it.'
  }
}

export function parseVideoUrl(input: string): ParsedUrl {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Paste a video link first.' }
  if (trimmed.length > 600) return { ok: false, error: 'That link is too long.' }

  let withProtocol = trimmed
  if (!/^https?:\/\//i.test(withProtocol)) {
    if (/^(www\.|m\.|music\.|youtu\.be|youtube\.com|tiktok\.com|vm\.tiktok|vt\.tiktok|instagram\.com)/i.test(withProtocol)) {
      withProtocol = `https://${withProtocol}`
    } else {
      return { ok: false, error: 'Enter a full link, including https://.' }
    }
  }

  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    return { ok: false, error: 'That link is not a valid URL.' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http and https links can be checked.' }
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Links with a username or password are not supported.' }
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const id = youtubeId(url, host)
    if (!id) {
      return { ok: false, error: 'This YouTube link does not point at a video. Use a watch or Shorts link.' }
    }
    return { ok: true, platform: 'youtube', normalizedUrl: `https://www.youtube.com/watch?v=${id}` }
  }

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const normalized = tiktokUrl(url, host)
    if (!normalized) return { ok: false, error: 'This TikTok link does not point at a video.' }
    return { ok: true, platform: 'tiktok', normalizedUrl: normalized }
  }

  if (host === 'instagram.com') {
    const normalized = instagramUrl(url)
    if (!normalized) {
      return { ok: false, error: 'Use an Instagram Reel link (instagram.com/reel/...), or upload the video file.' }
    }
    return { ok: true, platform: 'instagram', normalizedUrl: normalized }
  }

  return {
    ok: false,
    error: 'This app recognizes YouTube, TikTok, and Instagram links. For anything else, upload the video file.',
  }
}

function youtubeId(url: URL, host: string): string | null {
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return YOUTUBE_ID.test(id) ? id : null
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'watch') {
    const id = url.searchParams.get('v') ?? ''
    return YOUTUBE_ID.test(id) ? id : null
  }
  if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') {
    const id = parts[1] ?? ''
    return YOUTUBE_ID.test(id) ? id : null
  }
  return null
}

function tiktokUrl(url: URL, host: string): string | null {
  const parts = url.pathname.split('/').filter(Boolean)
  if (host === 'tiktok.com' && parts.length >= 3 && parts[1] === 'video' && /^\d{6,}$/.test(parts[2] ?? '')) {
    return `https://www.tiktok.com/${parts[0]}/video/${parts[2]}`
  }
  if ((host === 'vm.tiktok.com' || host === 'vt.tiktok.com') && /^[\w-]+$/.test(parts[0] ?? '')) {
    return `https://${host}/${parts[0]}`
  }
  if (host === 'tiktok.com' && parts[0] === 't' && /^[\w-]+$/.test(parts[1] ?? '')) {
    return `https://www.tiktok.com/t/${parts[1]}`
  }
  return null
}

function instagramUrl(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean)
  const kind = parts[0]
  const id = parts[1] ?? ''
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null
  if (kind === 'reel' || kind === 'reels' || kind === 'p' || kind === 'tv') {
    const normalizedKind = kind === 'reels' ? 'reel' : kind
    return `https://www.instagram.com/${normalizedKind}/${id}/`
  }
  return null
}
