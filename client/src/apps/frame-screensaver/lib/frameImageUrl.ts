import { NONE_FRAME_ID } from '@shared/screensaverFrames'
import { screensaverFrameUrl } from '../../../lib/api'
import { resolveBuiltinFrameUrl } from './defaultFrames'

export function frameImageUrl(frameId: string): string {
  if (frameId === NONE_FRAME_ID) throw new Error('No frame selected.')
  return resolveBuiltinFrameUrl(frameId) ?? screensaverFrameUrl(frameId)
}
