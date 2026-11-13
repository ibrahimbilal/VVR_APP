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
    path: '/shorts',
    label: 'Shorts',
    icon: ListVideo,
    description:
      'Export 9:16 ranking compilations from clips, or Image Motion Shorts from stills with pan, transitions, and music.',
  },
  {
    path: '/screensaver',
    label: 'Screensaver',
    icon: MonitorPlay,
    description:
      'Export long 16:9 ambient videos from one image or looping clip, with frames, adjustments, and Fast VFR or Optimized CFR.',
  },
  {
    path: '/thumbnails',
    label: 'Thumbnails',
    icon: ThumbnailIcon,
    description:
      'Compose 16:9 YouTube thumbnails in the browser with resolution and duration badges; PNG or JPEG download, no FFmpeg.',
  },
  {
    path: '/upscale',
    label: 'Image Upscaler',
    icon: Sparkles,
    description:
      'Upscale PNG, JPEG, and WebP to exact Full HD, 2K, 4K, or 8K. Standard uses Lanczos3; optional AI Lite uses local Real-ESRGAN.',
  },
  {
    path: '/looper',
    label: 'Audio Looper',
    icon: AudioLines,
    description:
      'Repeat one or more short audio files to an exact length (1 minute to 12 hours). Simple loop or Seamless crossfade between tracks.',
  },
]
