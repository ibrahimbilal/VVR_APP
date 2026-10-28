import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourceDir =
  process.env.BADGE_SVG_SOURCE ??
  String.raw`C:\Users\Gebruiker\Downloads\thumbnail-badges.html.html by html.to.design ❤️ FREE version - 28\10`
const outRoot = path.join(root, 'client/src/assets/thumbnail-badges')

/** Shared label order across chip sheets and plate/stack exports (12 badges). */
export const BADGE_SLUG_ORDER = [
  '1080p',
  '8h',
  '8k',
  '4k-uhd',
  '2k',
  '1h',
  '30m',
  '4k',
  '8k-uhd',
  '2-hours',
  '30-min',
  '720p',
] as const

export type BadgeAssetSlug = (typeof BADGE_SLUG_ORDER)[number]

/** Explicit 720p exports (html.to.design “Untitled” folder). Applied after full import or with --patch-only. */
export const BADGE_SVG_PATCH_FILES: Record<string, string> = {
  'Figure.svg': 'chips/gold/720p.svg',
  'Background+Shadow-1.svg': 'chips/silver/720p.svg',
  'Background+Border+Shadow.svg': 'chips/outline/720p.svg',
  'Background+Border+Shadow-1.svg': 'chips/invert/720p.svg',
  'Background+Shadow.svg': 'plates/gold-plate/720p.svg',
  'Group 8.svg': 'plates/silver-plate/720p.svg',
  'Group 10.svg': 'stacks/gold-stack/720p.svg',
  'Group 9.svg': 'stacks/silver-stack/720p.svg',
}

const defaultPatchDir = String.raw`C:\Users\Gebruiker\Downloads\Untitled`

const PATH_FINGERPRINT_SLUG: Record<string, BadgeAssetSlug> = {
  'M46.9641 100.5L63.32': '720p',
  'M41.8598 97.5V65.5L4': '1080p',
  'M56.8524 113V103.34L': '8h',
  'M52.0864 99.476V89.4': '8k',
  'M80.85 114.104C75.45': '4k-uhd',
  'M48.7969 107.924C45.': '2k',
  'M73.3599 113V54.12L7': '1h',
  'M53.7528 113V103.34L': '30m',
  'M48.9868 99.476V89.4': '4k',
  'M80.9445 114.104C75.': '8k-uhd',
  'M77.7504 114.104C72.': '2-hours',
  'M41.1392 113V54.12L4': '30-min',
  'M45.2271 113V54.12L5': '720p',
  'M63.55 90L77.65 58.1': '720p',
  'M63.55 78L77.65 46.1': '720p',
}

function fingerprint(svg: string): string | null {
  const match = /<path d="([^"]{20})/.exec(svg)
  return match?.[1] ?? null
}

function slugFromSvg(svg: string): BadgeAssetSlug | null {
  const fp = fingerprint(svg)
  return fp ? (PATH_FINGERPRINT_SLUG[fp] ?? null) : null
}

function writeAsset(relative: string, contents: string): void {
  const target = path.join(outRoot, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents, 'utf8')
}

function copyChipSet(globPrefix: string, styleFolder: string): void {
  const files = fs.readdirSync(sourceDir).filter((name) => name.startsWith(globPrefix) && name.endsWith('.svg'))
  for (const name of files) {
    const full = path.join(sourceDir, name)
    const svg = fs.readFileSync(full, 'utf8')
    const slug = slugFromSvg(svg)
    if (!slug) {
      console.warn(`skip ${name}: unknown path fingerprint`)
      continue
    }
    writeAsset(`chips/${styleFolder}/${slug}.svg`, svg)
  }
}

function splitSheet(sheetName: string, outFolder: string): void {
  const svg = fs.readFileSync(path.join(sourceDir, sheetName), 'utf8')
  const defsMatch = /<defs>([\s\S]*?)<\/defs>/.exec(svg)
  const defs = defsMatch?.[1] ?? ''
  const groupRe = /<g filter="url\(#([^"]+)\)">([\s\S]*?)<\/g>/g
  const filters = new Map<string, { x: number; y: number; width: number; height: number }>()
  const filterRe = /<filter id="([^"]+)"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"/g
  for (const match of svg.matchAll(filterRe)) {
    filters.set(match[1], {
      x: Number(match[2]),
      y: Number(match[3]),
      width: Number(match[4]),
      height: Number(match[5]),
    })
  }
  const groups: { filterId: string; body: string }[] = []
  for (const match of svg.matchAll(groupRe)) {
    groups.push({ filterId: match[1], body: match[2] })
  }
  if (groups.length !== BADGE_SLUG_ORDER.length) {
    console.warn(`${sheetName}: expected ${BADGE_SLUG_ORDER.length} groups, got ${groups.length}`)
  }
  groups.forEach((group, index) => {
    const box = filters.get(group.filterId)
    if (!box) {
      console.warn(`${sheetName}: missing filter ${group.filterId}`)
      return
    }
    const slug = BADGE_SLUG_ORDER[index]
    if (!slug) return
    const piece = `<svg width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>${defs}</defs>
<g filter="url(#${group.filterId})">${group.body}</g>
</svg>
`
    writeAsset(`${outFolder}/${slug}.svg`, piece)
  })
}

export function applyBadgeSvgPatch(patchDir: string): number {
  if (!fs.existsSync(patchDir)) {
    console.warn(`Patch folder not found: ${patchDir}`)
    return 0
  }
  let count = 0
  for (const [name, relative] of Object.entries(BADGE_SVG_PATCH_FILES)) {
    const source = path.join(patchDir, name)
    if (!fs.existsSync(source)) {
      console.warn(`skip patch ${name}: file missing`)
      continue
    }
    writeAsset(relative, fs.readFileSync(source, 'utf8'))
    count += 1
  }
  return count
}

function main(): void {
  const patchOnly = process.argv.includes('--patch-only')
  const patchDir = process.env.BADGE_SVG_PATCH ?? defaultPatchDir

  if (patchOnly) {
    fs.mkdirSync(outRoot, { recursive: true })
    const count = applyBadgeSvgPatch(patchDir)
    console.log(`Patched ${count} badge SVG(s) in ${outRoot}`)
    return
  }

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source folder not found: ${sourceDir}`)
    process.exit(1)
  }
  fs.rmSync(outRoot, { recursive: true, force: true })
  fs.mkdirSync(outRoot, { recursive: true })

  copyChipSet('Background+Shadow', 'silver')
  copyChipSet('Background+Border+Shadow', 'outline-temp')

  for (const name of fs.readdirSync(sourceDir)) {
    if (!name.startsWith('Background+Border+Shadow') || !name.endsWith('.svg')) continue
    const svg = fs.readFileSync(path.join(sourceDir, name), 'utf8')
    const slug = slugFromSvg(svg)
    if (!slug) continue
    const fillMatch = /width="200" height="144"[^/]*fill="([^"]+)"/.exec(svg)
    const fill = fillMatch?.[1] ?? ''
    if (fill === '#111111') writeAsset(`chips/invert/${slug}.svg`, svg)
    else if (fill === 'white') writeAsset(`chips/outline/${slug}.svg`, svg)
  }

  splitSheet('Container.svg', 'chips/gold')
  splitSheet('Frame 10.svg', 'plates/gold-plate')
  splitSheet('Frame 8.svg', 'plates/silver-plate')
  splitSheet('Group 8.svg', 'stacks/gold-stack')
  splitSheet('Group 9.svg', 'stacks/silver-stack')

  fs.rmSync(path.join(outRoot, 'chips/outline-temp'), { recursive: true, force: true })

  const patched = applyBadgeSvgPatch(patchDir)
  console.log(`Wrote badge SVGs to ${outRoot}${patched ? ` (plus ${patched} patch file(s) from ${patchDir})` : ''}`)
}

main()
