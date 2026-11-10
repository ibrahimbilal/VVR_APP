import type { ImageMotionSegment, ImageMotionProject } from '@shared/imageMotion'
import { stableExportFingerprint } from '../../../lib/exportFingerprint'

export function imageMotionExportFingerprint(
  project: ImageMotionProject,
  segments: ImageMotionSegment[],
  musicName: string | null,
): string {
  return stableExportFingerprint({
    name: project.name,
    video: project.video,
    audio: project.audio,
    segments: segments.map((s) => ({
      id: s.id,
      serverId: s.serverId,
      duration: s.motion.duration,
      motion: s.motion,
      transitionAfter: s.transitionAfter,
      width: s.width,
      height: s.height,
    })),
    music: musicName,
  })
}
