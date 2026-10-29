import type { NumberFormat, RankDisplay, RankPageStyle, RankSort, Source } from '../types'
import { playbackOrder } from './order'

export interface OverlayRank {
  label: string
  color: string
  title: string | null
  titleColor: string
}

export interface RankingSource {
  title: string
  rankColor: string | null
  titleColor?: string | null
  playAtEnd?: boolean
}

interface RankingRow extends RankingSource {
  listIndex: number
  playbackIndex: number
}

export function rankingRows(clips: RankingSource[], sort: RankSort = 'list'): RankingRow[] {
  const tagged = clips.map((clip, listIndex) => ({ ...clip, id: String(listIndex), listIndex }))
  const playback = playbackOrder(tagged)
  const playbackIndexOf = new Map(playback.map((clip, playbackIndex) => [clip.listIndex, playbackIndex]))
  const visual = tagged.slice()
  if (sort === 'reverse') {
    visual.reverse()
  } else if (sort === 'title' || sort === 'titleDesc') {
    visual.sort((a, b) => {
      const compared = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      if (compared !== 0) return sort === 'title' ? compared : -compared
      return a.listIndex - b.listIndex
    })
  }
  return visual.map((clip) => ({
    title: clip.title,
    rankColor: clip.rankColor,
    titleColor: clip.titleColor,
    playAtEnd: clip.playAtEnd,
    listIndex: clip.listIndex,
    playbackIndex: playbackIndexOf.get(clip.listIndex) ?? clip.listIndex,
  }))
}

export function overlayRanks(
  clips: RankingSource[],
  activeIndex: number,
  format: NumberFormat,
  fallbackColor: string,
  showTitle: boolean,
  display: RankDisplay = 'stack',
  fallbackTitleColor = '#ffffff',
  pageStyle: RankPageStyle = 'fraction',
  showPreviousTitles = false,
  sort: RankSort = 'list',
  showNumbers = true,
  titleHideAfter = 0,
  clipLocalTime = 0,
): OverlayRank[] {
  const rows = rankingRows(clips, sort)
  const active = rows.find((row) => row.listIndex === activeIndex) ?? rows.find((row) => row.playbackIndex === 0) ?? rows[0]
  if (!active) return []
  const hideCurrentTitle = titleHideAfter > 0 && clipLocalTime >= titleHideAfter
  const painted = rows.map((row) => {
    const title = row.title.trim()
    const current = row.listIndex === active.listIndex
    const previous = showPreviousTitles && row.playbackIndex < active.playbackIndex
    const showRowTitle = showTitle && title && (previous || (current && !hideCurrentTitle))
    return {
      label: showNumbers ? formatRank(row.listIndex, format) : '',
      color: row.rankColor || fallbackColor,
      title: showRowTitle ? title : null,
      titleColor: row.titleColor || fallbackTitleColor,
    }
  })
  if (display !== 'page') return painted
  const row = painted.find((item, index) => rows[index]?.listIndex === active.listIndex)
  if (!row) return []
  const title = active.title.trim()
  const label = showNumbers
    ? pageStyle === 'number'
      ? formatRank(active.listIndex, format)
      : pageLabel(active.listIndex, clips.length)
    : ''
  return [{ ...row, label, title: showTitle && title && !hideCurrentTitle ? title : null }]
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
