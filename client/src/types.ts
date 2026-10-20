export type Source = 'local' | 'youtube' | 'tiktok' | 'instagram'
export type UploadState = 'empty' | 'uploading' | 'ready' | 'error'
export type ScaleMode = 'crop' | 'fit' | 'blur'
export type Transition = 'cut' | 'fade'
export type NumberFormat = 'dot' | 'plain' | 'hash' | 'pad'
export type RankDisplay = 'stack' | 'page'
export type RankPageStyle = 'fraction' | 'number'
export type TextAlign = 'left' | 'center' | 'right'
export type PresetId = 'classic' | 'tier' | 'minimal' | 'custom'

export interface TitleSpan {
  id: string
  text: string
  color: string
  breakBefore: boolean
}

export interface BannerStyle {
  background: string
  height: number
  fontFamily: string
  fontSize: number
  fontWeight: number
  align: TextAlign
  lineHeight: number
  outlineWidth: number
  outlineColor: string
  shadow: boolean
}

export interface RankingStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  itemSpacing: number
  positionX: number
  positionY: number
  outlineWidth: number
  outlineColor: string
  shadow: boolean
  opacity: number
  format: NumberFormat
  display: RankDisplay
  pageStyle: RankPageStyle
}

export interface CaptionStyle {
  enabled: boolean
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  outlineWidth: number
  outlineColor: string
  shadow: boolean
  bottom: number
}

export interface VideoStyle {
  width: number
  height: number
  fps: number
  scaleMode: ScaleMode
  backgroundColor: string
  transition: Transition
  fadeDuration: number
  keepAudio: boolean
  normalize: boolean
  originalVolume: number
  musicVolume: number
}

export interface ProjectStyle {
  banner: BannerStyle
  ranking: RankingStyle
  caption: CaptionStyle
  video: VideoStyle
}

export interface Clip {
  id: string
  title: string
  fileName: string
  source: Source
  sourceUrl: string | null
  duration: number
  trimStart: number
  trimEnd: number
  serverId: string | null
  objectUrl: string | null
  thumbnail: string | null
  rankColor: string | null
  titleColor: string | null
  width: number
  height: number
  hasAudio: boolean
  uploadState: UploadState
  uploadProgress: number
  error: string | null
  previewBlocked: boolean
}

export type ExportPhase =
  | 'idle'
  | 'overlays'
  | 'uploading'
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'verifying'
  | 'done'
  | 'error'
  | 'cancelled'

export interface ExportState {
  phase: ExportPhase
  progress: number
  message: string
  error: string | null
  warning: string | null
  downloadUrl: string | null
  bytes: number | null
  jobId: string | null
}

export interface PersistedClip {
  id: string
  title: string
  fileName: string
  source: Source
  sourceUrl: string | null
  duration: number
  trimStart: number
  trimEnd: number
  serverId: string | null
  thumbnail: string | null
  rankColor: string | null
  titleColor: string | null
  width: number
  height: number
  hasAudio: boolean
}
