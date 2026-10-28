import { stageThumbnailTransfer } from '../thumbnail-studio/lib/stageTransfer'
import { useProjectStore } from '../../stores/project'

export async function createThumbnailFromRanking(artwork: Blob, linkMode: 'snapshot' | 'linked'): Promise<void> {
  const store = useProjectStore()
  await stageThumbnailTransfer({
    sourceApp: 'ranking-videos',
    sourceProjectId: 'ranking-videos',
    linkMode,
    returnPath: '/ranking-videos',
    title: store.name.trim() || store.titleText.trim() || 'Ranking',
    artwork,
    artworkName: 'ranking-frame.jpg',
    fit: 'cover',
    video: {
      width: store.style.video.width,
      height: store.style.video.height,
      durationSeconds: store.timeline.total > 0 ? store.timeline.total : undefined,
    },
  })
}

export async function blobFromThumbnail(source: string): Promise<Blob> {
  const response = await fetch(source)
  if (!response.ok) throw new Error('Could not read that clip image.')
  return response.blob()
}

export function captureVideoFrame(video: HTMLVideoElement | null): Promise<Blob | null> {
  if (!video || video.readyState < 2 || video.videoWidth < 2) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(video, 0, 0)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
  })
}
