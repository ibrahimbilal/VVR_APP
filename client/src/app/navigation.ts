import { LayoutDashboard, ListVideo, MonitorPlay } from '@lucide/vue'
import type { Component } from 'vue'

export interface NavItem {
  path: string
  label: string
  icon: Component
}

export const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/ranking-videos', label: 'Ranking Videos', icon: ListVideo },
  { path: '/frame-screensaver', label: 'Frame Screensaver', icon: MonitorPlay },
]
