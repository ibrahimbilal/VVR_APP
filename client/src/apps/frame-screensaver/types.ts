import type { ScreensaverComposition } from '@shared/screensaverComposition'
import type {
  EncoderChoice,
  ScreensaverAudioMode,
  ScreensaverFit,
  ScreensaverLoop,
  ScreensaverMode,
  ScreensaverProfile,
} from '@shared/screensaver'

export interface SavedScreensaverProject {
  version: 1 | 2
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
  composition?: ScreensaverComposition
}
