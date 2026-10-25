import type { BannerStyle, CaptionStyle, ProjectStyle, RankingStyle, TitleSpan, VideoStyle } from '../types'

export const FONT_OPTIONS = ['Oswald', 'Anton', 'Bebas Neue', 'Montserrat', 'Inter']
export const RANK_COLORS = ['#ffe14a', '#ff3b3b', '#3ee0ff', '#ffffff']

export interface PresetDefinition {
  id: 'classic' | 'tier' | 'minimal'
  label: string
  description: string
  titleText: string
  spans: TitleSpan[]
  banner: BannerStyle
  ranking: RankingStyle
  caption: CaptionStyle
  scaleMode: VideoStyle['scaleMode']
  backgroundColor: string
  transition: VideoStyle['transition']
  cycleRanks: boolean
}

const classicBanner: BannerStyle = {
  visible: true,
  background: '#000000',
  height: 240,
  fontFamily: 'Oswald',
  fontSize: 85,
  fontWeight: 700,
  align: 'center',
  lineHeight: 1.2,
  outlineWidth: 0,
  outlineColor: '#000000',
  shadow: true,
}

const classicRanking: RankingStyle = {
  fontFamily: 'Anton',
  fontSize: 85,
  fontWeight: 400,
  color: '#ffe14a',
  itemSpacing: 8,
  positionX: 36,
  positionY: 200,
  outlineWidth: 6,
  outlineColor: '#000000',
  shadow: true,
  opacity: 1,
  format: 'dot',
  display: 'stack',
  pageStyle: 'fraction',
  showPreviousTitles: false,
  sort: 'list',
}

const classicCaption: CaptionStyle = {
  enabled: true,
  fontFamily: 'Oswald',
  fontSize: 65,
  fontWeight: 700,
  color: '#ffffff',
  outlineWidth: 8,
  outlineColor: '#000000',
  shadow: true,
  bottom: 56,
}

export const PRESETS: Record<PresetDefinition['id'], PresetDefinition> = {
  classic: {
    id: 'classic',
    label: 'Classic Ranking',
    description: 'Black banner, white title, highlighted words.',
    titleText: 'Ranking Funniest Car Pranks Moments',
    spans: [
      { id: 'classic-1', text: 'Ranking', color: '#ffffff', breakBefore: false },
      { id: 'classic-2', text: 'Funniest', color: '#ff2d2d', breakBefore: false },
      { id: 'classic-3', text: 'Car', color: '#3ee0ff', breakBefore: false },
      { id: 'classic-4', text: 'Pranks', color: '#3ee0ff', breakBefore: false },
      { id: 'classic-5', text: 'Moments', color: '#ffffff', breakBefore: false },
    ],
    banner: classicBanner,
    ranking: classicRanking,
    caption: classicCaption,
    scaleMode: 'crop',
    backgroundColor: '#000000',
    transition: 'cut',
    cycleRanks: false,
  },
  tier: {
    id: 'tier',
    label: 'Tier List',
    description: 'Bold title and a different color on every number.',
    titleText: 'Biggest Tier List Moments',
    spans: [
      { id: 'tier-1', text: 'Biggest', color: '#ff3b3b', breakBefore: false },
      { id: 'tier-2', text: 'Tier', color: '#ffe14a', breakBefore: false },
      { id: 'tier-3', text: 'List', color: '#3ee0ff', breakBefore: false },
      { id: 'tier-4', text: 'Moments', color: '#ffffff', breakBefore: false },
    ],
    banner: { ...classicBanner, background: '#111111', height: 280, fontFamily: 'Anton', fontWeight: 400, fontSize: 84 },
    ranking: { ...classicRanking, fontSize: 230, format: 'hash', positionY: 20 },
    caption: { ...classicCaption, fontFamily: 'Anton', fontWeight: 400 },
    scaleMode: 'crop',
    backgroundColor: '#000000',
    transition: 'cut',
    cycleRanks: true,
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    description: 'Small title and a quiet number.',
    titleText: 'Top moments',
    spans: [
      { id: 'min-1', text: 'Top', color: '#ffffff', breakBefore: false },
      { id: 'min-2', text: 'moments', color: '#ffffff', breakBefore: false },
    ],
    banner: {
      ...classicBanner,
      fontFamily: 'Inter',
      fontSize: 52,
      fontWeight: 700,
      shadow: false,
      lineHeight: 1.15,
    },
    ranking: {
      ...classicRanking,
      fontFamily: 'Inter',
      fontSize: 84,
      fontWeight: 800,
      color: '#ffffff',
      outlineWidth: 0,
      shadow: false,
      format: 'plain',
      positionX: 40,
      positionY: 32,
    },
    caption: { ...classicCaption, enabled: false },
    scaleMode: 'crop',
    backgroundColor: '#000000',
    transition: 'cut',
    cycleRanks: false,
  },
}

export function createDefaultVideo(): VideoStyle {
  return {
    width: 1080,
    height: 1920,
    fps: 30,
    scaleMode: 'crop',
    backgroundColor: '#000000',
    transition: 'cut',
    fadeDuration: 0.35,
    keepAudio: true,
    normalize: true,
    originalVolume: 1,
    musicVolume: 0.35,
    encoder: 'auto',
  }
}

export function materializePreset(id: PresetDefinition['id'], video: VideoStyle): {
  style: ProjectStyle
  titleText: string
  spans: TitleSpan[]
  cycleRanks: boolean
} {
  const preset = PRESETS[id]
  const scale = video.width / 1080
  const px = (value: number) => Math.max(0, Math.round(value * scale))
  const outline = (value: number) => (value === 0 ? 0 : Math.max(1, px(value)))
  return {
    titleText: preset.titleText,
    spans: preset.spans.map((span) => ({ ...span })),
    cycleRanks: preset.cycleRanks,
    style: {
      banner: {
        ...preset.banner,
        height: Math.max(80, px(preset.banner.height)),
        fontSize: Math.max(28, px(preset.banner.fontSize)),
        outlineWidth: outline(preset.banner.outlineWidth),
      },
      ranking: {
        ...preset.ranking,
        fontSize: Math.max(36, px(preset.ranking.fontSize)),
        positionX: px(preset.ranking.positionX),
        positionY: px(preset.ranking.positionY),
        outlineWidth: outline(preset.ranking.outlineWidth),
      },
      caption: {
        ...preset.caption,
        fontSize: Math.max(18, px(preset.caption.fontSize)),
        bottom: Math.max(16, px(preset.caption.bottom)),
        outlineWidth: outline(preset.caption.outlineWidth),
      },
      video: {
        ...video,
        scaleMode: preset.scaleMode,
        backgroundColor: preset.backgroundColor,
        transition: preset.transition,
      },
    },
  }
}
