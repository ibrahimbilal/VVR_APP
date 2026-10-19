import type { NumberFormat, Source } from '../types'

export interface OverlayRank {
  label: string
  color: string
  title: string | null
}

export function overlayRanks(
  clips: { title: string; rankColor: string | null }[],
  activeIndex: number,
  format: NumberFormat,
  fallbackColor: string,
  showTitle: boolean,
): OverlayRank[] {
  return clips.map((clip, index) => {
    const title = clip.title.trim()
    return {
      label: formatRank(index, format),
      color: clip.rankColor || fallbackColor,
      title: showTitle && index === activeIndex && title ? title : null,
    }
  })
}

export function formatRank(index: number, format: NumberFormat): string {
  const number = index + 1
  switch (format) {
    case 'plain':
      return String(number)
    case 'hash':
      return `#${number}`
    case 'pad':
      return String(number).padStart(2, '0')
    default:
      return `${number}.`
  }
}

export function sourceLabel(source: Source): string {
  switch (source) {
    case 'youtube':
      return 'YouTube'
    case 'tiktok':
      return 'TikTok'
    case 'instagram':
      return 'Instagram'
    default:
      return 'Local file'
  }
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const whole = Math.floor(seconds)
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 10) return `${mb.toFixed(1)} MB`
  return `${Math.round(mb)} MB`
}

export function titleFromFileName(name: string): string {
  const stripped = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped.slice(0, 80) || 'Untitled clip'
}
