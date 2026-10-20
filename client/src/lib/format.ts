import type { NumberFormat, RankDisplay, RankPageStyle, Source } from '../types'

export interface OverlayRank {
  label: string
  color: string
  title: string | null
  titleColor: string
}

export function overlayRanks(
  clips: { title: string; rankColor: string | null; titleColor?: string | null }[],
  activeIndex: number,
  format: NumberFormat,
  fallbackColor: string,
  showTitle: boolean,
  display: RankDisplay = 'stack',
  fallbackTitleColor = '#ffffff',
  pageStyle: RankPageStyle = 'fraction',
): OverlayRank[] {
  const rows = clips.map((clip, index) => {
    const title = clip.title.trim()
    return {
      label: formatRank(index, format),
      color: clip.rankColor || fallbackColor,
      title: showTitle && index === activeIndex && title ? title : null,
      titleColor: clip.titleColor || fallbackTitleColor,
    }
  })
  if (display !== 'page' || rows.length === 0) return rows
  const index = activeIndex >= 0 && activeIndex < rows.length ? activeIndex : 0
  const row = rows[index]
  const clip = clips[index]
  if (!row || !clip) return []
  const title = clip.title.trim()
  const label = pageStyle === 'number' ? formatRank(index, format) : `${pageLabel(index, clips.length)}`
  return [{ ...row, label, title: title || null }]
}

export function pageLabel(index: number, total: number): string {
  const safeTotal = Math.max(1, total)
  const safeIndex = index >= 0 && index < total ? index : 0
  return `${safeIndex + 1} / ${safeTotal}`
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
