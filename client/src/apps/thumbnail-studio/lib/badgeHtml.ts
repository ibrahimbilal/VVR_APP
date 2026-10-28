import { badgeLines, chipLabel, clampBadgeScale, type BadgeStyleId } from '@shared/thumbnailProject'

export const BADGE_WIDTH_RATIO = 0.2

export function badgeReferenceWidth(frameWidth: number, scale: number): number {
  return Math.max(16, frameWidth * BADGE_WIDTH_RATIO * clampBadgeScale(scale))
}

const CHIPS = new Set<BadgeStyleId>(['gold', 'silver', 'outline', 'invert'])

export function isChipStyle(styleId: BadgeStyleId): boolean {
  return CHIPS.has(styleId)
}

/** HTML for one badge. `referenceWidth` is the unscaled plate width in pixels. `scale` resizes it. */
export function badgeMarkup(styleId: BadgeStyleId, text: string, referenceWidth: number, scale = 1): string {
  const width = Math.max(48, Math.round(referenceWidth))
  const body = isChipStyle(styleId) ? chipMarkup(styleId, text, width) : plateMarkup(styleId, text, width)
  return scaled(body.html, body.width, body.height, scale)
}

function plateMarkup(styleId: BadgeStyleId, text: string, width: number): { html: string; width: number; height: number } {
  const lines = badgeLines(text)
  const hero = esc(lines.hero)
  const foot = lines.foot ? esc(lines.foot) : ''
  const fs = Math.round(width * 0.24)
  const heroPx = Math.round(fs * (lines.hero.length <= 2 ? 1.9 : lines.hero.length <= 3 ? 1.55 : lines.hero.length <= 5 ? 1.15 : 0.88))
  const footPx = Math.round(width * (lines.foot && lines.foot.length > 10 ? 0.052 : 0.09))
  if (styleId === 'silver-plate') return { ...silverPlate(width, fs, hero, foot, heroPx, footPx), width }
  if (styleId === 'gold-stack') return { ...goldStack(width, fs, hero, foot, heroPx, footPx), width }
  if (styleId === 'silver-stack') return { ...silverStack(width, fs, hero, foot, heroPx, footPx), width }
  return { ...goldPlate(width, fs, hero, foot, heroPx, footPx), width }
}

function goldPlate(width: number, fs: number, hero: string, foot: string, heroPx: number, footPx: number): { html: string; height: number } {
  const height = width
  const pad = px(width, 0.04)
  const radius = px(width, 0.06)
  const heroPadY = px(width, 0.1)
  const heroPadX = px(width, 0.04)
  const html = `<div style="box-sizing:border-box;width:${width}px;padding:${pad}px;border-radius:${radius}px;background:linear-gradient(165deg,#fff6cc 0%,#f8d56a 18%,#e2ae34 46%,#a97812 74%,#f0d078 100%);box-shadow:0 ${px(width, 0.04)}px ${px(width, 0.08)}px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.75);font-size:${fs}px;line-height:1;">
    <div style="display:flex;flex-direction:column;">
      <div style="box-sizing:border-box;display:flex;flex:1;align-items:center;justify-content:center;min-height:0;padding:${heroPadY}px ${heroPadX}px;background:linear-gradient(#2c2c30,#121214);border-radius:${radius}px;overflow:hidden;">
        <span style="${goldText()}font-family:Montserrat,sans-serif;font-weight:700;font-size:${heroPx}px;line-height:.82;letter-spacing:${px(heroPx, -0.03)}px;white-space:nowrap;">${hero}</span>
      </div>
      ${foot ? `<div style="box-sizing:border-box;display:flex;align-items:flex-end;justify-content:center;color:#141414;margin-top:12px;font-family:Montserrat,sans-serif;font-weight:800;font-size:${footPx}px;letter-spacing:${px(footPx, 0.07)}px;white-space:nowrap;">${foot}</div>` : ''}
    </div>
  </div>`
  return { html, height }
}

function silverPlate(width: number, fs: number, hero: string, foot: string, heroPx: number, footPx: number): { html: string; height: number } {
  const height = width
  const pad = px(width, 0.04)
  const radius = px(width, 0.06)
  const heroPadY = px(width, 0.1)
  const heroPadX = px(width, 0.04)
  const html = `<div style="box-sizing:border-box;width:${width}px;padding:${pad}px;border-radius:${radius}px;background:linear-gradient(160deg,#ffffff 0%,#d5d8de 28%,#8e949c 62%,#f2f3f5 100%);box-shadow:0 ${px(width, 0.04)}px ${px(width, 0.08)}px rgba(0,0,0,.38),inset 0 1px 0 #fff;font-size:${fs}px;line-height:1;">
    <div style="display:flex;flex-direction:column;">
      <div style="box-sizing:border-box;display:flex;flex:1;align-items:center;justify-content:center;min-height:0;padding:${heroPadY}px ${heroPadX}px;background:linear-gradient(#2c2c30,#121214);border-radius:${radius}px;overflow:hidden;">
        <span style="${silverText()}font-family:Montserrat,sans-serif;font-weight:700;font-size:${heroPx}px;line-height:.82;letter-spacing:${px(heroPx, -0.03)}px;white-space:nowrap;">${hero}</span>
      </div>
      ${foot ? `<div style="box-sizing:border-box;display:flex;align-items:flex-end;justify-content:center;color:#141414;margin-top:12px;font-family:Montserrat,sans-serif;font-weight:800;font-size:${footPx}px;letter-spacing:${px(footPx, 0.07)}px;white-space:nowrap;">${foot}</div>` : ''}
    </div>
  </div>`
  return { html, height }
}

function goldStack(width: number, fs: number, hero: string, foot: string, heroPx: number, footPx: number): { html: string; height: number } {
  const height = Math.round(width / 1.3)
  const pad = px(width, 0.034)
  const radius = px(width, 0.05)
  const innerRadius = px(width, 0.04)
  const gap = px(fs, 0.08)
  const html = `<div style="box-sizing:border-box;width:${width}px;padding:${pad}px;border-radius:${radius}px;background:linear-gradient(180deg,#fff6d0,#e6b325 42%,#8a6812);box-shadow:0 ${px(width, 0.04)}px ${px(width, 0.08)}px rgba(0,0,0,.4);font-size:${fs}px;line-height:1;">
    <div style="box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${gap}px;border-radius:${innerRadius}px;background:#050505;padding:8px;">
      <span style="${goldText()}font-family:Montserrat,sans-serif;font-weight:700;font-size:${heroPx}px;line-height:.84;letter-spacing:${px(heroPx, -0.03)}px;white-space:nowrap;">${hero}</span>
      ${foot ? `<span style="${goldText()}font-family:Montserrat,sans-serif;font-weight:800;font-size:${footPx}px;letter-spacing:${px(footPx, 0.1)}px;white-space:nowrap;">${foot}</span>` : ''}
    </div>
  </div>`
  return { html, height }
}

function silverStack(width: number, fs: number, hero: string, foot: string, heroPx: number, footPx: number): { html: string; height: number } {
  const height = Math.round(width / 1.3)
  const pad = px(width, 0.034)
  const radius = px(width, 0.05)
  const innerRadius = px(width, 0.04)
  const gap = px(fs, 0.08)
  const html = `<div style="box-sizing:border-box;width:${width}px;padding:${pad}px;border-radius:${radius}px;background:linear-gradient(180deg,#ffffff 0%,#dfe2e6 28%,#9aa0a8 62%,#f2f3f5 100%);box-shadow:0 ${px(width, 0.04)}px ${px(width, 0.08)}px rgba(0,0,0,.4);font-size:${fs}px;line-height:1;">
    <div style="box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${gap}px;border-radius:${innerRadius}px;background:#050505;padding:8px;">
      <span style="${silverText()}font-family:Montserrat,sans-serif;font-weight:700;font-size:${heroPx}px;line-height:.84;letter-spacing:${px(heroPx, -0.03)}px;white-space:nowrap;">${hero}</span>
      ${foot ? `<span style="${silverText()}font-family:Montserrat,sans-serif;font-weight:800;font-size:${footPx}px;letter-spacing:${px(footPx, 0.1)}px;white-space:nowrap;">${foot}</span>` : ''}
    </div>
  </div>`
  return { html, height }
}

function chipMarkup(styleId: BadgeStyleId, text: string, width: number): { html: string; width: number; height: number } {
  const label = esc(chipLabel(text))
  const len = Math.max(1, label.length)
  const font = Math.round(Math.max(width * 0.28, Math.min(width * 0.46, (width * 1.15) / len)))
  const height = Math.round(width * 0.72)
  const radius = Math.round(width * 0.10)
  const pad = Math.round(width * 0.14)
  const shadow = `0 ${Math.round(width * 0.04)}px ${Math.round(width * 0.08)}px rgba(0,0,0,.35)`
  const border = Math.max(3, Math.round(width * 0.045))
  const textWidth = Math.round(font * len * 0.62)
  const boxWidth = Math.max(width, textWidth + pad * 2 + (styleId === 'gold' || styleId === 'silver' ? 0 : border * 2))
  let face = `background:linear-gradient(180deg,#fff1b8 0%,#f6d15a 30%,#e6b325 68%,#c8962e 100%);color:#141414;box-shadow:${shadow},inset 0 1px 0 rgba(255,255,255,.75);`
  if (styleId === 'silver') face = `background:linear-gradient(180deg,#ffffff 0%,#e4e7ec 28%,#a8aeb6 62%,#d5d8de 100%);color:#141414;box-shadow:${shadow},inset 0 1px 0 #fff;`
  if (styleId === 'outline') face = `background:#fff;color:#111;border:${border}px solid #111;box-shadow:${shadow};`
  if (styleId === 'invert') face = `background:#111;color:#fff;border:${border}px solid #fff;box-shadow:${shadow};`
  const html = `<div style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:${boxWidth}px;height:${height}px;padding:0 ${pad}px;border-radius:${radius}px;font-family:Montserrat,sans-serif;font-weight:700;font-size:${font}px;letter-spacing:${Math.round(font * 0.02)}px;line-height:1;white-space:nowrap;${face}">${label}</div>`
  return { html, width: boxWidth, height }
}

function scaled(html: string, width: number, height: number, scale: number): string {
  const safe = clampBadgeScale(scale)
  const outerW = Math.max(1, Math.round(width * safe))
  const outerH = Math.max(1, Math.round(height * safe))
  return `<div style="width:${outerW}px;height:${outerH}px;"><div style="width:${width}px;height:${height}px;scale:${safe};transform-origin:0 0;">${html}</div></div>`
}

function px(base: number, ratio: number): number {
  return Math.round(base * ratio)
}

function goldText(): string {
  return 'display:inline-block;background:linear-gradient(180deg,#fff6cc 0%,#f8d56a 40%,#e0a82a 78%,#a97812 100%);-webkit-background-clip:text;background-clip:text;color:#f0c14b;-webkit-text-fill-color:transparent;'
}

function silverText(): string {
  return 'display:inline-block;background:linear-gradient(180deg,#ffffff 0%,#dfe2e6 42%,#9aa0a8 100%);-webkit-background-clip:text;background-clip:text;color:#d5d8de;-webkit-text-fill-color:transparent;'
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}
