import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import RankingVideosView from '../apps/ranking-videos/RankingVideosView.vue'
import FrameScreensaverView from '../apps/frame-screensaver/FrameScreensaverView.vue'

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
      meta: { title: 'Ranking Videos' },
    },
    {
      path: '/frame-screensaver',
      name: 'frame-screensaver',
      component: FrameScreensaverView,
      meta: { title: 'Frame Screensaver' },
    },
  ],
})
