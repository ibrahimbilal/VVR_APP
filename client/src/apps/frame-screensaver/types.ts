import type { ScreensaverComposition } from '@shared/screensaverComposition'
import type {
  EncoderChoice,
  ScreensaverAudioMode,
  ScreensaverCfrQuality,
  ScreensaverFit,
  ScreensaverLoop,
  ScreensaverMode,
  ScreensaverProfile,
  ScreensaverRenderMode,
} from '@shared/screensaver'
import type { SubscribeAnimationSettings } from '@shared/screensaverSubscribeAnimation'

export interface SavedScreensaverProject {
  version: 1 | 2 | 3
  /** Persistent id. Missing on projects saved before the project list. */
  id?: string
  createdAt?: number
  updatedAt?: number
  name: string
  mode: ScreensaverMode
  mediaKind: 'image' | 'video' | null
  serverId: string | null
  fileName: string
  width: number
  height: number
  sourceDuration: number | null
  hasAudio: boolean
  thumbnail: string | null
  outputWidth: number
  outputHeight: number
  fps: number
  durationSeconds: number
  durationPresetKey: string
  fit: ScreensaverFit
  loopType: ScreensaverLoop
  crossfadeSeconds: number
  audioMode: ScreensaverAudioMode
  audioVolume: number
  audioFadeIn: number
  audioFadeOut: number
  loopAudio: boolean
  backgroundColor: string
  audioFileName: string | null
  profile?: ScreensaverProfile
  encoder?: EncoderChoice
  /** Missing on older saves — load as fast-vfr (do not migrate silently). */
  renderingMode?: ScreensaverRenderMode
  cfrQuality?: ScreensaverCfrQuality
  composition?: ScreensaverComposition
  /** Saved with the project so Open restores the subscribe overlay. */
  subscribeAnimation?: SubscribeAnimationSettings
  /** Snapshot of export settings; updated when the project is saved. */
  configFingerprint?: string
}
