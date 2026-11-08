import { AudioLines, Image as ThumbnailIcon, Sparkles, LayoutDashboard, ListVideo, MonitorPlay } from '@lucide/vue'
import type { Component } from 'vue'

export interface NavItem {
  path: string
  label: string
  icon: Component
  description?: string
}

export const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  {
    path: '/ranking-videos',
    label: 'Shorts',
    icon: ListVideo,
    description:
      'Create vertical ranking and compilation videos with customizable titles, numbered clips, transitions, and audio.',
  },
  {
    path: '/screensaver',
    label: 'Screensaver',
    icon: MonitorPlay,
    description:
      'Create long-form 16:9 ambient videos, digital art displays, and TV screensavers from images and videos.',
  },
  {
    path: '/thumbnail-studio',
    label: 'Thumbnail Studio',
    icon: ThumbnailIcon,
    description: 'Design YouTube thumbnails from your own images or from a Shorts or Screensaver project.',
  },
  {
    path: '/image-upscaler',
    label: 'Image Upscaler',
    icon: Sparkles,
    description:
      'Resize PNG, JPEG, and WebP images to exact Full HD, 2K, 4K, or 8K pixels with Lanczos3 resampling. It interpolates existing pixels and does not invent missing detail.',
  },
  {
    path: '/audio-looper',
    label: 'Audio Looper',
    icon: AudioLines,
    description:
      'Turn one short audio file into an exact-length ambient track. Simple repeats, or seamless equal-power crossfades, then export MP3, WAV, or FLAC.',
  },
]
