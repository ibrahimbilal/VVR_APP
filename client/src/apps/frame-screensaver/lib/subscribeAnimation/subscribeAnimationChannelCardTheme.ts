import type { SubscribeChannelCardTheme } from '@shared/screensaverSubscribeAnimation'

export interface SubscribeChannelCardThemeColors {
  cardFill: string
  cardStroke: string
  channelName: string
  channelSubscribers: string
  avatarFallback: string
  avatarInitials: string
  iconButtonIdle: string
  iconButtonActive: string
  iconButtonStroke: string
  iconDefault: string
  iconLike: string
  buttonClickedFill: string
  buttonClickedLabel: string
  buttonClickedIcon: string
}

const DARK: SubscribeChannelCardThemeColors = {
  cardFill: 'rgba(12, 12, 16, 0.82)',
  cardStroke: 'rgba(255,255,255,0.12)',
  channelName: '#f4f4f5',
  channelSubscribers: 'rgba(244, 244, 245, 0.72)',
  avatarFallback: '#0078f8',
  avatarInitials: '#ffffff',
  iconButtonIdle: 'rgba(30, 30, 36, 0.92)',
  iconButtonActive: 'rgba(82, 82, 91, 0.95)',
  iconButtonStroke: 'rgba(255,255,255,0.18)',
  iconDefault: '#ffffff',
  iconLike: '#0078f8',
  buttonClickedFill: '#ffffff',
  buttonClickedLabel: '#09090b',
  buttonClickedIcon: '#000000',
}

const LIGHT: SubscribeChannelCardThemeColors = {
  cardFill: 'rgba(255, 255, 255, 0.96)',
  cardStroke: 'rgba(0, 0, 0, 0.1)',
  channelName: '#0f0f0f',
  channelSubscribers: '#606060',
  avatarFallback: '#065fd4',
  avatarInitials: '#ffffff',
  iconButtonIdle: 'rgba(0, 0, 0, 0.06)',
  iconButtonActive: 'rgba(0, 0, 0, 0.12)',
  iconButtonStroke: 'rgba(0, 0, 0, 0.12)',
  iconDefault: '#0f0f0f',
  iconLike: '#065fd4',
  buttonClickedFill: '#0f0f0f',
  buttonClickedLabel: '#ffffff',
  buttonClickedIcon: '#ffffff',
}

export function subscribeChannelCardThemeColors(theme: SubscribeChannelCardTheme): SubscribeChannelCardThemeColors {
  return theme === 'light' ? LIGHT : DARK
}
