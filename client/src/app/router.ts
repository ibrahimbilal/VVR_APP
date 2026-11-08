import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import RankingVideosView from '../apps/ranking-videos/RankingVideosView.vue'
import FrameScreensaverView from '../apps/frame-screensaver/FrameScreensaverView.vue'
import ThumbnailStudioView from '../apps/thumbnail-studio/ThumbnailStudioView.vue'
import ImageUpscalerView from '../apps/image-upscaler/ImageUpscalerView.vue'
import AudioLooperView from '../apps/audio-looper/AudioLooperView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { title: 'Dashboard' },
    },
    {
      path: '/shorts',
      name: 'shorts',
      component: RankingVideosView,
      meta: { title: 'Shorts' },
    },
    {
      path: '/screensaver',
      name: 'screensaver',
      component: FrameScreensaverView,
      meta: { title: 'Screensaver' },
    },
    {
      path: '/thumbnails',
      name: 'thumbnails',
      component: ThumbnailStudioView,
      meta: { title: 'Thumbnails' },
    },
    {
      path: '/upscale',
      name: 'upscale',
      component: ImageUpscalerView,
      meta: { title: 'Image Upscaler' },
    },
    {
      path: '/looper',
      name: 'looper',
      component: AudioLooperView,
      meta: { title: 'Audio Looper' },
    },
    { path: '/ranking-videos', redirect: '/shorts' },
    { path: '/frame-screensaver', redirect: '/screensaver' },
    { path: '/thumbs', redirect: '/thumbnails' },
    { path: '/thumbnail-studio', redirect: '/thumbnails' },
    { path: '/image-upscaler', redirect: '/upscale' },
    { path: '/audio-looper', redirect: '/looper' },
  ],
})
