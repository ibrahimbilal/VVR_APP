import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import RankingVideosView from '../apps/ranking-videos/RankingVideosView.vue'
import FrameScreensaverView from '../apps/frame-screensaver/FrameScreensaverView.vue'
import ThumbnailStudioView from '../apps/thumbnail-studio/ThumbnailStudioView.vue'
import ImageUpscalerView from '../apps/image-upscaler/ImageUpscalerView.vue'

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
      path: '/ranking-videos',
      name: 'ranking-videos',
      component: RankingVideosView,
      meta: { title: 'Shorts' },
    },
    {
      path: '/frame-screensaver',
      name: 'frame-screensaver',
      component: FrameScreensaverView,
      meta: { title: 'Screensaver' },
    },
    {
      path: '/thumbnail-studio',
      name: 'thumbnail-studio',
      component: ThumbnailStudioView,
      meta: { title: 'Thumbnail Studio' },
    },
    {
      path: '/image-upscaler',
      name: 'image-upscaler',
      component: ImageUpscalerView,
      meta: { title: 'Image Upscaler' },
    },
  ],
})
